(() => {
  const run = async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await window.__TAURI_INTERNALS__.invoke('updater_fixture');
    } catch (error) {
      console.error('UPDATER_FIXTURE_FAILED', String(error));
      await window.__TAURI_INTERNALS__.invoke('integration_report', { errors: [String(error)] });
    }
  };
  window.addEventListener('DOMContentLoaded', run, { once: true });
})();
