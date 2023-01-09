import type { AppProps } from "next/app";
import Header from "../components/Header";
import UpdateBanner from "../components/UpdateBanner";
import LogProvider from "../providers/LogProvider";

import "../style.css";

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }: AppProps) {

  return (
    <LogProvider>
      <UpdateBanner />
      <Header />
      <Component {...pageProps} />
    </LogProvider>
  );
}
