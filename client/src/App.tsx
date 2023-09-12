import { BrowserRouter, Route, Routes } from "react-router-dom";
import NotFoundPage from "./pages/NotFoundPage";
import UploadPage from "./pages/UploadPage";
import WatchPage from "./pages/WatchPage";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

export default function App() {
  return (
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        colorScheme: "dark",
        primaryColor: "violet",
        primaryShade: 4,
      }}
    >
      <Notifications />
      <BrowserRouter>
        <Routes>
          <Route index element={<UploadPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
