import { emit, listen } from '@tauri-apps/api/event'
import { m } from '@tauri-apps/api/fs-4bb77382';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router'
import { useLogs } from '../providers/LogProvider';

const UpdateBanner = () => {
  const router = useRouter()
  const [updateNeeded, setUpdateNeeded] = useState(false);
  const { addLog } = useLogs();
  
  useEffect(() => {
    emit('tauri://update');
    setInterval(() => {
      emit("tauri://update");
    }, 5 * 60 * 1000);
    listen('tauri://update-available', function (res) {
      console.log('New version available: ', res)
      setUpdateNeeded(true);
    });
  }, []);

  useEffect(() => {
    (window as any).checkForUpdates = async function () {
      const checkUpdate = (await import('@tauri-apps/api/updater')).checkUpdate;
      const installUpdate = (await import('@tauri-apps/api/updater')).installUpdate;
      const update = await checkUpdate();
      if (update.shouldUpdate) {
        addLog({
          date: new Date(),
          note: 'Checking for updates returned a true value',
          title: 'Update needed'
        })
        console.log(`Installing update ${update.manifest?.version}, ${update.manifest?.date}`);
        await installUpdate();
      } else {
        addLog({
          date: new Date(),
          note: 'Checking for updates returned a false value',
          title: 'Update not needed'
        })
      }
    };

    (window as any).goToLink = async function (link) {
      router.push(link)
    };
  }, [])

  const handleUpdate = async () => {
    const installUpdate = (await import('@tauri-apps/api/updater')).installUpdate;
    const relaunch = (await import('@tauri-apps/api/process')).relaunch;
    await installUpdate();
    await relaunch();
  }

  if(!updateNeeded) {
    return <></>;
  }

  return (
    <div className="update-banner">
      An update is now available. <span className="update-banner__action" onClick={handleUpdate}>Click here to update</span>.
    </div>
  )
}

export default UpdateBanner;