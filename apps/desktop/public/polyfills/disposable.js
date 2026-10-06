// Must run before Tauri's Resource class evaluates its computed disposal method.
// Older system webviews do not provide this symbol, even when syntax is compiled.
if (!Symbol.asyncDispose) {
  Object.defineProperty(Symbol, 'asyncDispose', {
    value: Symbol('Symbol.asyncDispose'),
  });
}
