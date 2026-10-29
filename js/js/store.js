// Datenschicht: Firebase Firestore (mit Offline-Cache und anonymer Anmeldung)
// oder – solange config.js leer ist – ein lokaler Testmodus im Browser-Speicher.
import { firebaseConfig } from '../config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => ALPHABET[b % 32]).join('');
}
export const normalizeCode = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatCode = (c) => c.match(/.{1,4}/g).join('-');
export const newId = () => newCode().slice(0, 12).toLowerCase();

export async function openStore() {
  return firebaseConfig.apiKey ? openFirestore() : openLocal();
}

async function openFirestore() {
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const auth = au.getAuth(app);
  await new Promise((resolve, reject) => {
    const off = au.onAuthStateChanged(auth, (user) => {
      if (user) { off(); resolve(); }
    });
    au.signInAnonymously(auth).catch((e) => { off(); reject(e); });
  }).catch((e) => {
    // offline ohne gespeicherte Anmeldung
    if (!auth.currentUser) throw e;
  });

  const hh = (code) => fs.doc(db, 'households', code);
  const col = (code, name) => fs.collection(db, 'households', code, name);
  const fail = (e) => console.error('Fairplan:', e);
  // Schreibvorgänge nicht abwarten: offline landen sie im Cache und werden später übertragen
  const write = (p) => { p.catch(fail); };

  return {
    mode: 'firebase',
    async getHousehold(code) {
      const s = await fs.getDoc(hh(code));
      return s.exists() ? s.data() : null;
    },
    async createHousehold(code, data, tasks) {
      await fs.setDoc(hh(code), data); // Regeln prüfen beim Anlegen der Aufgaben, dass der Haushalt existiert
      const batch = fs.writeBatch(db);
      for (const t of tasks) batch.set(fs.doc(col(code, 'tasks'), t.id), t);
      write(batch.commit());
    },
    watchHousehold: (code, cb) => fs.onSnapshot(hh(code), (s) => cb(s.data() || null), fail),
    watchTasks: (code, cb) => fs.onSnapshot(col(code, 'tasks'), (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))), fail),
    watchCompletions(code, keys, cb) {
      const parts = [];
      for (let i = 0; i < keys.length; i += 30) parts.push(keys.slice(i, i + 30));
      const maps = parts.map(() => new Map());
      const emit = () => cb(new Map(maps.flatMap((m) => [...m])));
      const offs = parts.map((chunk, i) => fs.onSnapshot(
        fs.query(col(code, 'completions'), fs.where('key', 'in', chunk)),
        (s) => { maps[i] = new Map(s.docs.map((d) => [d.id, d.data()])); emit(); },
        fail,
      ));
      if (!parts.length) emit();
      return () => offs.forEach((o) => o());
    },
    watchHistory: (code, n, cb) => fs.onSnapshot(
      fs.query(col(code, 'completions'), fs.orderBy('at', 'desc'), fs.limit(n)),
      (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))),
      fail,
    ),
    // Erledigungen eines Zeitraums (für den Kalender), day als 'YYYY-MM-DD'
    watchDays: (code, from, to, cb) => fs.onSnapshot(
      fs.query(col(code, 'completions'), fs.where('day', '>=', from), fs.where('day', '<=', to)),
      (s) => cb(s.docs.map((d) => ({ ...d.data(), id: d.id }))),
      fail,
    ),
    updateHousehold: (code, patch) => write(fs.updateDoc(hh(code), patch)),
    saveTask: (code, task) => write(fs.setDoc(fs.doc(col(code, 'tasks'), task.id), task)),
    deleteTask: (code, id) => write(fs.deleteDoc(fs.doc(col(code, 'tasks'), id))),
    setCompletion: (code, id, data) => write(fs.setDoc(fs.doc(col(code, 'completions'), id), data)),
    removeCompletion: (code, id) => write(fs.deleteDoc(fs.doc(col(code, 'completions'), id))),
  };
}

// ---------- Lokaler Testmodus ----------

function openLocal() {
  const KEY = 'fairplan.localdb';
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { data = {}; }
  const listeners = new Set();
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* Speicher voll/gesperrt */ }
    queueMicrotask(() => listeners.forEach((l) => l()));
  };
  const h = (code) => data[code];
  // wie Firestore: erste Lieferung asynchron
  const listen = (fn) => { queueMicrotask(fn); listeners.add(fn); return () => listeners.delete(fn); };
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  return {
    mode: 'local',
    async getHousehold(code) { return clone(h(code)?.doc) || null; },
    async createHousehold(code, doc, tasks) {
      data[code] = { doc, tasks: Object.fromEntries(tasks.map((t) => [t.id, t])), completions: {} };
      save();
    },
    watchHousehold: (code, cb) => listen(() => cb(clone(h(code)?.doc) || null)),
    watchTasks: (code, cb) => listen(() => cb(Object.values(clone(h(code)?.tasks) || {}))),
    watchCompletions: (code, keys, cb) => listen(() => {
      const all = Object.entries(h(code)?.completions || {});
      cb(new Map(all.filter(([, c]) => keys.includes(c.key)).map(([id, c]) => [id, clone(c)])));
    }),
    watchHistory: (code, n, cb) => listen(() => {
      const all = Object.entries(h(code)?.completions || {}).map(([id, c]) => ({ ...clone(c), id }));
      cb(all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, n));
    }),
    watchDays: (code, from, to, cb) => listen(() => {
      const all = Object.entries(h(code)?.completions || {}).map(([id, c]) => ({ ...clone(c), id }));
      cb(all.filter((c) => c.day >= from && c.day <= to));
    }),
    updateHousehold(code, patch) { Object.assign(h(code).doc, clone(patch)); save(); },
    saveTask(code, task) { h(code).tasks[task.id] = clone(task); save(); },
    deleteTask(code, id) { delete h(code).tasks[id]; save(); },
    setCompletion(code, id, c) { h(code).completions[id] = clone(c); save(); },
    removeCompletion(code, id) { delete h(code).completions[id]; save(); },
  };
}
