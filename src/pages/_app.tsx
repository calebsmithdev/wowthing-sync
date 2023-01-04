import type { AppProps } from "next/app";
import LogProvider from "../providers/LogProvider";

import "../style.css";

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }: AppProps) {

  return (
    <LogProvider>
      <Component {...pageProps} />
    </LogProvider>
  );
}
