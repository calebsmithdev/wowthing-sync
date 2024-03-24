import { useUpdater } from '../providers/UpdateProvider';

const UpdateBanner = () => {
  const { updateNeeded, handleUpdate } = useUpdater();

  if(!updateNeeded) {
    return <></>;
  }

  return (
    <div className="update-banner">
      An update is now available. <span className="update-banner__action" onClick={handleUpdate}>Click here to update</span>{' '}
      or <a className="update-banner__action" href="https://github.com/calebsmithdev/wowthing-sync/releases/latest" target="_blank">visit here</a> to download.
    </div>
  )
}

export default UpdateBanner;