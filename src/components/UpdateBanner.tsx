import { emit, listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react';

const UpdateBanner = () => {
  const [updateNeeded, setUpdateNeeded] = useState(false);
  
  useEffect(() => {
    emit('tauri://update');
    setInterval(() => {
      emit("tauri://update");
    }, 5 * 60 * 1000);
    listen('tauri://update-available', function (res) {
      console.log('New version available: ', res)
      setUpdateNeeded(true);
    });
    listen('tauri://update-status', async function (res) {
      console.log('New status: ', res)
      if(res.payload.status === 'DONE') {
        const relaunch = (await import('@tauri-apps/api/process')).relaunch;
        await relaunch();
      }
    })
  }, []);

  const handleUpdate = () => {
    emit('tauri://update-install')
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