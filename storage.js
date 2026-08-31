(() => {
function accessStorage(operation, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    return { ok: true, value: operation(target) };
  } catch (error) {
    return { ok: false, error };
  }
}

function readStorage(key, storage) {
  return accessStorage((target) => target.getItem(key), storage);
}

function writeStorage(key, value, storage) {
  return accessStorage((target) => target.setItem(key, value), storage);
}

function removeStorage(key, storage) {
  return accessStorage((target) => target.removeItem(key), storage);
}

globalThis.MyPolyphonyStorage = Object.freeze({
  readStorage,
  removeStorage,
  writeStorage,
});
})();
