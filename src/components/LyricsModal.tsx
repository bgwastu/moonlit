"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconMusic,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useLyricsSearch } from "@/hooks/useLyricsSearch";
import type { LyricsSearchRecord } from "@/lib/lyrics";
import { getLyricsExcerpt } from "@/lib/lyricsSearch";
import { getFormattedTime } from "@/utils";
import styles from "./LyricsModal.module.css";

interface LyricsModalProps {
  opened: boolean;
  onClose: () => void;
  trackKey: string;
  trackArtistName: string;
  hasLyrics: boolean;
  canShowRomanization: boolean;
  showLyrics: boolean;
  onToggleLyrics: (show: boolean) => void;
  showRomanization: boolean;
  onToggleRomanization: (show: boolean) => void;
  romanizationLoading: boolean;
  romanizationError: string | null;
  onRetryRomanization: () => void;
  trackDurationSeconds: number;
  currentLyricsId: number | null;
  currentLyricsTrackName: string | null;
  currentLyricsArtistName: string | null;
  currentLyricsAlbumName?: string | null;
  currentOffset: number;
  onOffsetChange: (offset: number) => void;
  initialSearchQuery: string;
  initialSearchResults: LyricsSearchRecord[];
  onSelectLyrics: (record: LyricsSearchRecord) => void;
}

export default function LyricsModal(props: LyricsModalProps) {
  const reducedMotion = useReducedMotion();
  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      size={440}
      centered
      radius="lg"
      zIndex={400}
      padding="lg"
      withCloseButton={false}
      overlayProps={{ backgroundOpacity: 0.45, blur: 3 }}
      transitionProps={{ transition: "fade", duration: reducedMotion ? 0 : 160 }}
      classNames={{
        inner: styles.modalInner,
        content: styles.modalContent,
        body: styles.modalBody,
      }}
    >
      <LyricsContent key={props.trackKey} {...props} />
    </Modal>
  );
}

function LyricsContent(props: LyricsModalProps) {
  const [searching, setSearching] = useState(!props.hasLyrics);
  const [adjusting, setAdjusting] = useState(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const songName = props.currentLyricsTrackName || props.initialSearchQuery;
  const artistName = props.currentLyricsArtistName || props.trackArtistName;
  const offsetLabel = `${props.currentOffset > 0 ? "+" : ""}${props.currentOffset.toFixed(1)}s`;
  const handleBack = () => {
    setSearching(false);
    requestAnimationFrame(() => changeButtonRef.current?.focus());
  };

  return (
    <>
      <Group justify="space-between" wrap="nowrap" className={styles.header}>
        <Group gap="xs" wrap="nowrap">
          {searching && props.hasLyrics && (
            <ActionIcon
              variant="subtle"
              color="gray"
              size={40}
              aria-label="Back to lyrics"
              onClick={handleBack}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
          )}
          <Modal.Title className={styles.title}>
            {searching ? "Find lyrics" : "Lyrics"}
          </Modal.Title>
        </Group>
        <ActionIcon
          variant="subtle"
          color="gray"
          size={40}
          aria-label="Close lyrics"
          onClick={props.onClose}
        >
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {searching ? (
        <LyricsSearch {...props} />
      ) : (
        <div>
          <div className={styles.song}>
            <div className={styles.songIcon} aria-hidden="true">
              <IconMusic size={22} />
            </div>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} size="sm" lineClamp={2}>
                {songName}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {[artistName, props.currentLyricsAlbumName].filter(Boolean).join(" · ")}
              </Text>
            </Box>
            <Button
              ref={changeButtonRef}
              variant="subtle"
              size="compact-sm"
              onClick={() => setSearching(true)}
              aria-label="Change lyrics"
            >
              Change
            </Button>
          </div>
          <Switch
            label="Show lyrics"
            labelPosition="left"
            checked={props.showLyrics}
            onChange={(event) => props.onToggleLyrics(event.currentTarget.checked)}
            classNames={{
              root: styles.switchRow,
              body: styles.switchBody,
              labelWrapper: styles.switchLabel,
            }}
          />
          {props.canShowRomanization && (
            <Switch
              label={
                <Group gap={8} wrap="nowrap">
                  <span>Romanization</span>
                  {props.showRomanization && props.romanizationLoading && (
                    <Loader size={12} aria-label="Loading romanization" />
                  )}
                </Group>
              }
              description="Read lyrics in the Latin alphabet"
              labelPosition="left"
              checked={props.showRomanization}
              onChange={(event) =>
                props.onToggleRomanization(event.currentTarget.checked)
              }
              classNames={{
                root: styles.switchRow,
                body: styles.switchBody,
                labelWrapper: styles.switchLabel,
              }}
            />
          )}
          {props.canShowRomanization &&
            props.showRomanization &&
            props.romanizationError && (
              <Group justify="space-between" gap="xs" className={styles.errorRow}>
                <Text size="xs" c="dimmed" role="status">
                  {props.romanizationError}
                </Text>
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={props.onRetryRomanization}
                >
                  Retry
                </Button>
              </Group>
            )}
          <UnstyledButton
            className={styles.timingToggle}
            aria-expanded={adjusting}
            aria-controls="lyrics-timing-controls"
            onClick={() => setAdjusting((previous) => !previous)}
          >
            <span>Adjust timing</span>
            <span className={styles.timingSummary}>
              {props.currentOffset !== 0 && offsetLabel}
              {adjusting ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </span>
          </UnstyledButton>
          {adjusting && (
            <div id="lyrics-timing-controls" className={styles.timingControls}>
              <Text size="xs" c="dimmed" mb="sm">
                Move the lyrics to match what you hear.
              </Text>
              <div className={styles.timingStepper}>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    props.onOffsetChange(
                      Math.round((props.currentOffset - 0.1) * 10) / 10,
                    )
                  }
                >
                  Earlier
                </Button>
                <Text size="sm" fw={600} className={styles.offset} aria-live="polite">
                  {offsetLabel}
                </Text>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() =>
                    props.onOffsetChange(
                      Math.round((props.currentOffset + 0.1) * 10) / 10,
                    )
                  }
                >
                  Later
                </Button>
              </div>
              <Group justify="space-between" mt="xs">
                <Text size="xs" c="dimmed">
                  {props.currentOffset === 0
                    ? "Adjusts by 0.1 second"
                    : `Lyrics appear ${Math.abs(props.currentOffset).toFixed(1)}s ${props.currentOffset < 0 ? "earlier" : "later"}`}
                </Text>
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-xs"
                  disabled={props.currentOffset === 0}
                  onClick={() => props.onOffsetChange(0)}
                >
                  Reset
                </Button>
              </Group>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LyricsSearch(props: LyricsModalProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const inputRef = useRef<HTMLInputElement>(null);
  const track = useMemo(
    () => ({
      title: props.initialSearchQuery,
      artist: props.trackArtistName,
      duration: props.trackDurationSeconds,
    }),
    [props.initialSearchQuery, props.trackArtistName, props.trackDurationSeconds],
  );
  const { query, setQuery, results, status, searchNow } = useLyricsSearch({
    enabled: props.opened,
    initialQuery: props.initialSearchQuery,
    initialResults: props.initialSearchResults,
    track,
  });
  useEffect(() => {
    if (isMobile || !props.opened) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isMobile, props.opened]);

  return (
    <div className={styles.search}>
      <TextInput
        ref={inputRef}
        aria-label="Search lyrics"
        placeholder="Song title or artist"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            searchNow();
          }
        }}
        size="md"
        radius="md"
        leftSection={<IconSearch size={18} />}
        rightSection={
          query ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <IconX size={16} />
            </ActionIcon>
          ) : null
        }
      />
      <div className={styles.searchStatus} role="status" aria-live="polite">
        {status === "loading" ? (
          <Group gap={8}>
            <Loader size={12} />
            <span>Finding lyrics…</span>
          </Group>
        ) : status === "ready" && results.length > 0 ? (
          `${results.length} ${results.length === 1 ? "match" : "matches"} · Choose one to use it`
        ) : null}
      </div>
      <div
        className={styles.results}
        aria-label="Lyrics matches"
        aria-busy={status === "loading"}
      >
        {status === "error" ? (
          <div className={styles.empty}>
            <Text size="sm" fw={500}>
              Couldn’t find lyrics right now
            </Text>
            <Text size="xs" c="dimmed">
              Check your connection and try again.
            </Text>
            <Button variant="light" size="sm" mt="xs" onClick={searchNow}>
              Try again
            </Button>
          </div>
        ) : status === "idle" ? (
          <div className={styles.empty}>
            <IconSearch size={28} opacity={0.4} aria-hidden="true" />
            <Text size="sm" c="dimmed">
              Search by song title or artist
            </Text>
          </div>
        ) : status === "ready" && results.length === 0 ? (
          <div className={styles.empty}>
            <IconMusic size={28} opacity={0.4} aria-hidden="true" />
            <Text size="sm" fw={500}>
              No synced lyrics found
            </Text>
            <Text size="xs" c="dimmed">
              Try just the song title, or add the artist.
            </Text>
          </div>
        ) : results.length === 0 ? (
          <div className={styles.skeletons} aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className={styles.skeleton} />
            ))}
          </div>
        ) : (
          <div className={status === "loading" ? styles.pendingResults : undefined}>
            {results.map((record) => {
              const selected = record.id === props.currentLyricsId;
              const excerpt = getLyricsExcerpt(record);
              const hasDuration = Number.isFinite(record.duration) && record.duration > 0;
              const difference = record.duration - props.trackDurationSeconds;
              const sameLength =
                hasDuration &&
                props.trackDurationSeconds > 0 &&
                Math.abs(difference) <= 1;
              return (
                <UnstyledButton
                  key={record.id}
                  className={styles.result}
                  data-selected={selected || undefined}
                  disabled={status === "loading"}
                  onClick={() => props.onSelectLyrics(record)}
                >
                  <div className={styles.resultHeading}>
                    <Text size="sm" fw={600} lineClamp={2}>
                      {record.trackName}
                    </Text>
                    {selected && (
                      <IconCheck
                        size={18}
                        className={styles.selectedIcon}
                        aria-label="Current lyrics"
                      />
                    )}
                  </div>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {[record.artistName, record.albumName].filter(Boolean).join(" · ")}
                  </Text>
                  {excerpt && (
                    <Text size="xs" mt={8} lineClamp={2} className={styles.excerpt}>
                      {excerpt}
                    </Text>
                  )}
                  {hasDuration && (
                    <div className={styles.resultMeta}>
                      <span>{getFormattedTime(record.duration)}</span>
                      {props.trackDurationSeconds > 0 && (
                        <span data-match={sameLength || undefined}>
                          {sameLength
                            ? "Same length"
                            : `${Math.abs(Math.round(difference))}s ${difference > 0 ? "longer" : "shorter"}`}
                        </span>
                      )}
                    </div>
                  )}
                </UnstyledButton>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
