import { useEffect, useState } from "react";

const BuildInfo = () => {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const getVersion = async () => {
      const appVersion = (await import('@tauri-apps/api/app')).getVersion
      const fullAppVersion = await appVersion();
      setAppVersion(fullAppVersion);
    }

    getVersion();
  })

  return (
    <div className="build-info">
      v{appVersion}
    </div>
  )
}

export default BuildInfo;