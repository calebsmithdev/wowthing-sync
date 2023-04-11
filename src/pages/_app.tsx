import type { AppProps } from "next/app";
import Header from "../components/Header";
import UpdateBanner from "../components/UpdateBanner";
import LogProvider from "../providers/LogProvider";
import UpdateProvider from "../providers/UpdateProvider";

import "../style.css";
import dynamic from "next/dynamic";

const DynamicWindowFunctions = dynamic(
  () => import('../components/DynamicWindowFunctions'),
  { ssr: false }
);

// This default export is required in a new `pages/_app.js` file.
export default function MyApp({ Component, pageProps }: AppProps) {

  return (
    <LogProvider>
      <UpdateProvider>
        <DynamicWindowFunctions />
        <UpdateBanner />
        <Header />
        <Component {...pageProps} />
      </UpdateProvider>
    </LogProvider>
  );
}
