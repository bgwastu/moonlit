import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import UploadPage from "./pages/UploadPage";

export default function App() {
  return (
    <MantineProvider
      defaultColorScheme="dark"
      theme={{
        primaryColor: "violet",
        primaryShade: 4,
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route index element={<UploadPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
