jest.mock('expo/src/winter/ImportMetaRegistry', () => ({
  ImportMetaRegistry: {
    get url() {
      return null;
    },
  },
}));

const defineGlobal = (name: string, value: unknown) => {
  try {
    Object.defineProperty(global, name, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    // Ignore environments that don't allow redefining these globals.
  }
};
defineGlobal('fetch', globalThis.fetch);
defineGlobal('Headers', globalThis.Headers);
defineGlobal('Request', globalThis.Request);
defineGlobal('Response', globalThis.Response);
defineGlobal('FormData', globalThis.FormData);
defineGlobal('URL', globalThis.URL);
defineGlobal('URLSearchParams', globalThis.URLSearchParams);

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (object) => JSON.parse(JSON.stringify(object));
}
