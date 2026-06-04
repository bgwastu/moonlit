"use client";

import { useState } from "react";
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
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconCookie } from "@tabler/icons-react";

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

  const authHeaders = {
    Authorization: `Bearer ${password}`,
    "Content-Type": "application/json",
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await fetch("/api/admin/cookies", { headers: authHeaders });

      if (res.status === 401) {
        setLoginError("Incorrect password");
        return;
      }
      if (res.status === 403) {
        setLoginError("Admin not configured. Set ADMIN_PASSWORD environment variable.");
        return;
      }
      if (!res.ok) {
        setLoginError("Failed to connect to server");
        return;
      }

      const data = await res.json();
      setCookies(data.cookies || "");
      setIsLoggedIn(true);
    } catch {
      setLoginError("Failed to connect to server");
    } finally {
      setLoginLoading(false);
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

  if (!isLoggedIn) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <Title order={2}>Admin Settings</Title>
          <Text color="dimmed">Enter the admin password to access settings.</Text>

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
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {cookiesError}
              </Alert>
            )}

            {cookiesSuccess && (
              <Alert icon={<IconCheck size={16} />} color="green" variant="light">
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
      </Stack>
    </Container>
  );
}
