import { createContext, useContext, useState } from "react";

type Log = {
  date: Date;
  note: string;
  title: string;
}

interface LogProviderContext {
  logs: Log[];
  addLog: (log: Log) => Promise<void>;
}

const Context = createContext<LogProviderContext>({
  logs: [],
  addLog: async () => new Promise<void>(resolve => resolve()),
});

const LogProvider = ({ children }: { children: React.ReactNode }) => {
  const [logs, setLog] = useState<Log[]>([]);

  const values = {
    logs,
    addLog: async (log) => setLog(existing => [log, ...existing]),
  };

  return (
    <Context.Provider value={values}>
      {children}
    </Context.Provider>
  );
};

export const useLogs = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useLogs must be used within an LogProvider');
  }
  return context;
};

export default LogProvider;