import type { SavedBattle } from './turn_service.js';
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
    return database ??= new Promise((resolve, reject) => {
        const request = indexedDB.open('great-goose-raid-recordings', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('battles', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => { database = undefined; reject(new Error('Could not open saved battles in this browser.')); };
        request.onblocked = () => reject(new Error('Close other raid tabs and try opening saved battles again.'));
    });
}
export async function saveBattle(record: SavedBattle): Promise<void> {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('battles', 'readwrite'), store = tx.objectStore('battles');
        let reason = 'Could not save this turn in your browser. The previous accepted turn remains available.';
        const request = store.get(record.id);
        request.onsuccess = () => {
            const previous = request.result as SavedBattle | undefined;
            if ((previous && record.revision !== previous.revision + 1) || (!previous && record.revision !== 0)) {
                reason = 'This battle was advanced in another tab. Restore the saved battle before continuing.';
                tx.abort();
                return;
            }
            store.put(record);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error(reason));
    });
}
export async function loadBattle(id: string): Promise<SavedBattle> {
    const db = await open();
    return new Promise((resolve, reject) => {
        const request = db.transaction('battles').objectStore('battles').get(id);
        request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('Saved battle was not found.'));
        request.onerror = () => reject(request.error);
    });
}
export async function listBattles() {
    const db = await open();
    const all = await new Promise<SavedBattle[]>((resolve, reject) => {
        const request = db.transaction('battles').objectStore('battles').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return all.sort((a, b) => b.updated - a.updated).map(b => ({ id: b.id, updated: b.updated, boss: b.snapshot.boss.name, tick: b.tick, status: b.snapshot.status }));
}
