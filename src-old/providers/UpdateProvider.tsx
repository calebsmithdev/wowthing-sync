import { createContext, useContext, useEffect, useRef, useState } from "react";
import { emit, listen } from '@tauri-apps/api/event'

interface UpdateProviderContext {
  updateNeeded: boolean;
  handleUpdate: () => Promise<void>;
}

const Context = createContext<UpdateProviderContext>({
  updateNeeded: false,
  handleUpdate: async () => new Promise<void>(resolve => resolve()),
});

const UpdateProvider = ({ children }: { children: React.ReactNode }) => {
  const [updateNeeded, setUpdateNeeded] = useState(false);
  
  useEffect(() => {
    emit('tauri://update');
    console.log('emit')
    
    setInterval(() => {
      emit("tauri://update");
    }, 5 * 60 * 1000);

    listen('tauri://update-available', function (res) {
      console.log('New version available: ', res);
      setUpdateNeeded(true);
    });
  }, []);

  const handleUpdate = async () => {
    const installUpdate = (await import('@tauri-apps/api/updater')).installUpdate;
    const relaunch = (await import('@tauri-apps/api/process')).relaunch;
    await installUpdate();
    await relaunch();
  }


  const values = {
    updateNeeded,
    handleUpdate,
  };

  return (
    <Context.Provider value={values}>
      {children}
    </Context.Provider>
  );
};

export const useUpdater = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useUpdater must be used within an LogProvider');
  }
  return context;
};

export default UpdateProvider;