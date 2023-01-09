import relativeTime from 'dayjs/plugin/relativeTime'
import dayjs from "dayjs";
import UpdateBanner from "../components/UpdateBanner";
import BuildInfo from "../components/BuildInfo";
import { useLogs } from "../providers/LogProvider";
import Link from 'next/link';

dayjs.extend(relativeTime)

function LogsPage() {
  const { logs } = useLogs();

  return (
    <>
    <div className="container py-8">
      <h1 className="font-bold text-3xl">WoWthing [insert cool logo here]</h1>

      <div className="card mt-10">
        <h2 className="mb-6">Application Logs</h2>
        <table>
          <thead>
            <tr>
              <th colSpan={2}>Date</th>
              <th colSpan={4}>Event</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={dayjs(log.date).format()}>
                <td colSpan={2}>{dayjs(log.date).format('DD/MM/YYYY hh:mma')}</td>
                <td colSpan={6}>
                  <p className="font-xl font-bold">{log.title}</p>
                  <p><small>{log.note}</small></p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    <BuildInfo />
    </>
  );
}

export default LogsPage;
