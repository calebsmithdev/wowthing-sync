import { useRouter } from 'next/router'
import { useEffect } from 'react';

const Header = () => {
  const router = useRouter()

  useEffect(() => {
    (window as any).checkForUpdates = async function () {
      const checkUpdate = (await import('@tauri-apps/api/updater')).checkUpdate;
      const installUpdate = (await import('@tauri-apps/api/updater')).installUpdate;
      const update = await checkUpdate();
      if (update.shouldUpdate) {
        await installUpdate();
      }
    };

    (window as any).goToLink = async function (link) {
      router.push(link)
    };
  }, [])

  return <></>;
}

export default Header;