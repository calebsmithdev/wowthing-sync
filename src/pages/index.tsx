import { useApiKeys } from "../composables/apiStorage";
import { open } from '@tauri-apps/api/dialog';
import { useProgramFolder } from "../composables/programFolder";
import { useFileUpload } from "../composables/fileUpload";
import relativeTime from 'dayjs/plugin/relativeTime'
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import UpdateBanner from "../components/UpdateBanner";
import BuildInfo from "../components/BuildInfo";
import { useLogs } from "../providers/LogProvider";

dayjs.extend(relativeTime)

function App() {
  const [updatedTimeAgo, setUpdatedTimeAgo] = useState('');
  const {apiKey, setKey} = useApiKeys();
  const {folder, setFolder, getDefaultPath} = useProgramFolder();
  const { addLog } = useLogs();
  const { handleUpload, lastUpdated, startFileWatchingProcess, stopFileWatchingProcess, watchingFiles } = useFileUpload();

  const openFolderDialog = async () => {
    const defaultPath = await getDefaultPath();
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultPath,
    });
    setFolder(selected);
  }

  useEffect(() => {
    if(folder) {
      startFileWatchingProcess();
    } else {
      stopFileWatchingProcess();
    }
  }, [folder])

  useEffect(() => {
    setUpdatedTimeAgo(dayjs(lastUpdated).fromNow());
    const timer = setInterval(() => {
      if(!lastUpdated) return;
      const date = dayjs(lastUpdated).fromNow();
      setUpdatedTimeAgo(date);
    }, 5000);

    return () => {
      clearInterval(timer);
    }
  },[lastUpdated])

  return (
    <>
    <UpdateBanner />
    <div className="container py-8">
      <h1 className="font-bold text-3xl">WoWthing [insert cool logo here]</h1>

      <div className="flex -mx-5 pt-10 flex-wrap">
        <div className="w-full md:w-1/3 lg:w-1/4 px-5 mb-5 md:mb-0 text-center">
          <div className="card">
            <h2 className="mb-6">Info</h2>
            {lastUpdated && updatedTimeAgo ? (
              <p className="mb-5">Data uploaded {updatedTimeAgo}</p>
            ) : (
              <p className="mb-5">Waiting to upload</p>
            )}
            {apiKey && folder && 
              <button type="button" onClick={() => handleUpload(true)} className="button mb-3">
                Manually Upload Data
              </button>
            }
          </div>
        </div>

        <div className="w-full md:w-2/3 lg:w-3/4 px-5">
          <div className="card">
            <h2 className="mb-6">Settings</h2>
            <div className="pb-4">
              <label htmlFor="api-key" className="block text-sm font-medium">API Key</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input 
                  type="password"
                  name="api-key"
                  id="api-key"
                  onChange={(e) => setKey(e.currentTarget.value)}
                  value={apiKey}
                  placeholder="Enter your WoWthing API key"
                />
              </div>
            </div>

            <div className="pb-4">
              <label htmlFor="folder" className="block text-sm font-medium">World of Warcraft "_retail_" Folder</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input 
                  name="folder"
                  id="folder"
                  onChange={(e) => setKey(e.currentTarget.value)}
                  value={folder}
                  readOnly
                  className="flex-grow w-auto"
                  onClick={() => openFolderDialog()}
                  placeholder="Click here to select a folder"
                />
                <button type="button" onClick={() => openFolderDialog()} className="button flex-shrink input-button">
                  Select Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <BuildInfo />
    </>
  );
}

export default App;
