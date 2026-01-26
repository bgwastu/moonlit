"use client";

import {
  Alert,
  Button,
  Card,
  Container,
  Flex,
  Loader,
  PasswordInput,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCookie,
  IconDownload,
  IconRefresh,
  IconTestPipe,
} from "@tabler/icons-react";
import { useState } from "react";

const DEFAULT_TEST_URL = "https://www.youtube.com/watch?v=XgSobzBJFtg";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Cookies state
  const [cookies, setCookies] = useState("");
  const [cookiesLoading, setCookiesLoading] = useState(false);
  const [cookiesError, setCookiesError] = useState<string | null>(null);
  const [cookiesSuccess, setCookiesSuccess] = useState(false);

  // yt-dlp state
  const [ytdlpVersion, setYtdlpVersion] = useState<string | null>(null);
  const [ytdlpLoading, setYtdlpLoading] = useState(false);
  const [ytdlpError, setYtdlpError] = useState<string | null>(null);
  const [ytdlpSuccess, setYtdlpSuccess] = useState<string | null>(null);

  // Test state
  const [testUrl, setTestUrl] = useState(DEFAULT_TEST_URL);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${password}`,
    "Content-Type": "application/json",
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);

    try {
      // Test authentication by fetching yt-dlp version
      const res = await fetch("/api/admin/ytdlp", {
        headers: { Authorization: `Bearer ${password}` },
      });

      if (res.status === 401) {
        setLoginError("Incorrect password");
        return;
      }
      if (res.status === 403) {
        setLoginError(
          "Admin not configured. Set ADMIN_PASSWORD environment variable.",
        );
        return;
      }
      if (!res.ok) {
        setLoginError("Failed to connect to server");
        return;
      }

      const data = await res.json();
      setYtdlpVersion(data.version);
      setIsLoggedIn(true);

      // Load cookies
      loadCookies();
    } catch {
      setLoginError("Failed to connect to server");
    } finally {
      setLoginLoading(false);
    }
  };

  const loadCookies = async () => {
    setCookiesLoading(true);
    setCookiesError(null);

    try {
      const res = await fetch("/api/admin/cookies", {
        headers: authHeaders,
      });

      if (res.ok) {
        const data = await res.json();
        setCookies(data.cookies || "");
      } else {
        setCookiesError("Failed to load cookies");
      }
    } catch {
      setCookiesError("Failed to connect to server");
    } finally {
      setCookiesLoading(false);
    }
  };

  const saveCookies = async () => {
    setCookiesLoading(true);
    setCookiesError(null);
    setCookiesSuccess(false);

    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ cookies }),
      });

      if (res.ok) {
        setCookiesSuccess(true);
        setTimeout(() => setCookiesSuccess(false), 3000);
      } else {
        setCookiesError("Failed to save cookies");
      }
    } catch {
      setCookiesError("Failed to connect to server");
    } finally {
      setCookiesLoading(false);
    }
  };

  const refreshVersion = async () => {
    setYtdlpLoading(true);
    setYtdlpError(null);
    setYtdlpSuccess(null);

    try {
      const res = await fetch("/api/admin/ytdlp", {
        headers: authHeaders,
      });

      if (res.ok) {
        const data = await res.json();
        setYtdlpVersion(data.version);
      } else {
        setYtdlpError("Failed to get version");
      }
    } catch {
      setYtdlpError("Failed to connect to server");
    } finally {
      setYtdlpLoading(false);
    }
  };

  const updateYtdlp = async () => {
    setYtdlpLoading(true);
    setYtdlpError(null);
    setYtdlpSuccess(null);

    try {
      const res = await fetch("/api/admin/ytdlp", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ action: "update" }),
      });

      if (res.ok) {
        const data = await res.json();
        setYtdlpVersion(data.version);
        setYtdlpSuccess(`Updated to ${data.version}`);
      } else {
        const data = await res.json();
        setYtdlpError(data.error || "Failed to update");
      }
    } catch {
      setYtdlpError("Failed to connect to server");
    } finally {
      setYtdlpLoading(false);
    }
  };

  const testDownload = async () => {
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/admin/ytdlp", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ action: "test", url: testUrl }),
      });

      const data = await res.json();

      if (res.ok) {
        setTestResult({
          success: true,
          message: `✓ Working! "${data.title}" by ${data.author} (${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, "0")})`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.details || data.error || "Test failed",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Failed to connect to server",
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <Title order={2}>Admin Settings</Title>
          <Text color="dimmed">
            Enter the admin password to access settings.
          </Text>

          <PasswordInput
            label="Password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={loginError}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
          />

          <Button onClick={handleLogin} loading={loginLoading}>
            Login
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="sm" py="xl">
      <Stack spacing="lg">
        <Title order={2}>Admin Settings</Title>

        {/* System Cookies */}
        <Card withBorder>
          <Stack>
            <Flex align="center" gap="xs">
              <IconCookie size={20} />
              <Title order={4}>System Cookies</Title>
            </Flex>
            <Text size="sm" color="dimmed">
              Configure default cookies for all users. These are used when users
              haven&apos;t configured their own cookies.
            </Text>

            {cookiesLoading && !cookies ? (
              <Flex justify="center" py="md">
                <Loader size="sm" />
              </Flex>
            ) : (
              <Textarea
                value={cookies}
                onChange={(e) => setCookies(e.currentTarget.value)}
                placeholder={`# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t0\tCOOKIE_NAME\tVALUE`}
                minRows={8}
                autosize
                styles={{
                  input: {
                    fontFamily: "monospace",
                    fontSize: "11px",
                  },
                }}
              />
            )}

            {cookiesError && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
              >
                {cookiesError}
              </Alert>
            )}

            {cookiesSuccess && (
              <Alert
                icon={<IconCheck size={16} />}
                color="green"
                variant="light"
              >
                Cookies saved successfully!
              </Alert>
            )}

            <Button
              leftIcon={<IconCookie size={16} />}
              onClick={saveCookies}
              loading={cookiesLoading}
            >
              Save Cookies
            </Button>
          </Stack>
        </Card>

        {/* yt-dlp Management */}
        <Card withBorder>
          <Stack>
            <Flex align="center" gap="xs">
              <IconDownload size={20} />
              <Title order={4}>yt-dlp Management</Title>
            </Flex>

            <Flex align="center" gap="md">
              <Text>
                Version:{" "}
                <Text component="span" weight={600}>
                  {ytdlpVersion || "Unknown"}
                </Text>
              </Text>
              <Button
                size="xs"
                variant="subtle"
                leftIcon={<IconRefresh size={14} />}
                onClick={refreshVersion}
                loading={ytdlpLoading}
              >
                Refresh
              </Button>
            </Flex>

            {ytdlpError && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
              >
                {ytdlpError}
              </Alert>
            )}

            {ytdlpSuccess && (
              <Alert
                icon={<IconCheck size={16} />}
                color="green"
                variant="light"
              >
                {ytdlpSuccess}
              </Alert>
            )}

            <Button
              leftIcon={<IconDownload size={16} />}
              onClick={updateYtdlp}
              loading={ytdlpLoading}
              variant="light"
            >
              Update yt-dlp
            </Button>

            <Text size="sm" weight={600} mt="md">
              Test URL
            </Text>
            <TextInput
              value={testUrl}
              onChange={(e) => setTestUrl(e.currentTarget.value)}
              placeholder="Enter YouTube URL to test"
            />

            {testResult && (
              <Alert
                icon={
                  testResult.success ? (
                    <IconCheck size={16} />
                  ) : (
                    <IconAlertCircle size={16} />
                  )
                }
                color={testResult.success ? "green" : "red"}
                variant="light"
              >
                <Text style={{ wordBreak: "break-word" }}>
                  {testResult.message}
                </Text>
              </Alert>
            )}

            <Button
              leftIcon={<IconTestPipe size={16} />}
              onClick={testDownload}
              loading={testLoading}
              variant="outline"
            >
              Test Download
            </Button>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
