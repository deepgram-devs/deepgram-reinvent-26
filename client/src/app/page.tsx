"use client";

import { RTVIEvent } from "@pipecat-ai/client-js";
import { usePipecatClientTransportState, useRTVIClientEvent } from "@pipecat-ai/client-react";
import { PipecatAppBase, type PipecatBaseChildProps } from "@pipecat-ai/voice-ui-kit";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { ClaimReview } from "@/components/claim/ClaimReview";
import { EmployeeSession } from "@/components/employee/EmployeeDesk";
import { Landing } from "@/components/landing/Landing";
import { Listening } from "@/components/listening/Listening";
import { TryAsking, VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import type { Fixture } from "@/fixtures/fixtures";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { DocumentLanguage, useT } from "@/i18n";
import { FixtureConversation, LiveConversation } from "@/lib/conversation";
import { isPersona, PersonaProvider, usePersona, type Persona } from "@/lib/persona";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { SessionProvider, useSession } from "@/lib/session";
import { SettingsProvider } from "@/lib/settings";

// Locally, the browser talks to the bot directly over SmallWebRTC. A deployed
// build sets NEXT_PUBLIC_PIPECAT_TRANSPORT=daily, and the call goes through a
// Daily room instead, so neither side has to accept inbound connections.
// Next inlines the value at build time.
const TRANSPORT = process.env.NEXT_PUBLIC_PIPECAT_TRANSPORT === "daily" ? "daily" : "smallwebrtc";

// What the bot learns from the browser when the call starts: who's calling,
// and the voice to start in (agent.py, persona_from_body and voice_from_body)
type StartRequest = { persona: Persona; voice?: string };

// SmallWebRTC: the browser sends its WebRTC offer here; next.config.ts passes
// it on to the bot, and requestData reaches it as runner_args.body. One object
// per persona, kept outside the component: PipecatAppBase rebuilds its client
// whenever these objects change, so switching persona between calls is fine.
const WEBRTC_PARAMS: Record<Persona, { webrtcRequestParams: { endpoint: string; requestData: StartRequest } }> = {
  policyholder: { webrtcRequestParams: { endpoint: "/api/offer", requestData: { persona: "policyholder" } } },
  employee: { webrtcRequestParams: { endpoint: "/api/offer", requestData: { persona: "employee" } } },
};

// Daily: the runner's /start creates a room, starts the bot in it, and returns
// the room and token the browser joins. body reaches the bot as runner_args.body.
function dailyParams(persona: Persona) {
  const body: StartRequest = { persona };
  return {
    endpoint: "/api/start",
    requestData: { transport: "daily", createDailyRoom: true, body },
  };
}
const DAILY_PARAMS: Record<Persona, ReturnType<typeof dailyParams>> = {
  policyholder: dailyParams("policyholder"),
  employee: dailyParams("employee"),
};

const CONNECT_PARAMS = TRANSPORT === "daily" ? DAILY_PARAMS : WEBRTC_PARAMS;

/**
 * Write the voice the call starts in into the persona's params, just before
 * connecting. It goes into the same object rather than a new one: a new
 * object makes PipecatAppBase rebuild its client, which drops a call in
 * progress, and between calls remounts the screens, closing Settings while a
 * voice is being picked. Set at Start, it can't change during the call;
 * switching voice during a call is a set-voice message instead.
 */
function setStartVoice(persona: Persona, voice: string) {
  const params = CONNECT_PARAMS[persona];
  if ("webrtcRequestParams" in params) params.webrtcRequestParams.requestData.voice = voice;
  else params.requestData.body.voice = voice;
}

type Phase = "idle" | "connecting" | "live";

const CONNECTING = ["initializing", "initialized", "authenticating", "authenticated", "connecting", "connected"];

function Screens({
  phase,
  error,
  notice,
  forced,
  onStart,
  onEnd,
  onPersonaChange,
}: {
  phase: Phase;
  error: string | null;
  /** Not an error: why the last call ended, when the agent ended it */
  notice: string | null;
  /** A fixture's screen, instead of the one the call is on */
  forced?: Fixture["screen"];
  onStart: () => void;
  onEnd: () => void;
  onPersonaChange: (persona: Persona) => void;
}) {
  const { claim } = useSession();
  const persona = usePersona();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [details, setDetails] = useState(false);
  const live = phase === "live";

  const screen =
    forced ??
    (phase !== "live" ? "landing" : !claim ? "listening" : wide || details ? "review" : "found");

  if (screen === "landing") {
    return (
      <Landing
        onStart={onStart}
        connecting={phase === "connecting"}
        error={error}
        notice={notice}
        persona={persona}
        onPersonaChange={onPersonaChange}
      />
    );
  }
  const aside = wide ? (
    <aside className="w-[26rem] shrink-0 p-6">
      <div className="sticky top-6 space-y-5">
        <VoiceSessionPanel onEnd={onEnd} live={live || !!forced} />
        <TryAsking />
      </div>
    </aside>
  ) : null;
  // Staff screens follow the claim card they opened, kept in EmployeeSession.
  // The session's claim, which the agent sends when a card opens, only feeds
  // the review screen's focus and highlights, so it never moves the desk.
  if (persona === "employee") {
    return <EmployeeSession live={live || !!forced} onEnd={onEnd} aside={aside} />;
  }
  if (screen === "review" && claim) {
    return <ClaimReview claim={claim} live={live || !!forced} onEnd={onEnd} />;
  }
  return (
    <Listening onOpenClaim={() => setDetails(true)} aside={aside} />
  );
}

function LiveApp({
  connect,
  disconnect,
  connectError,
  onPersonaChange,
}: {
  connect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  connectError: string | null;
  onPersonaChange: (persona: Persona) => void;
}) {
  const state = usePipecatClientTransportState();
  const { reset, endReason, voice: activeVoice } = useSession();
  const persona = usePersona();
  const { voice: preferred, setVoice } = usePreferences();
  const t = useT();
  const [starting, setStarting] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  // The agent hung up on a quiet caller, so the landing screen says why
  const [idleEnded, setIdleEnded] = useState(false);

  // The voice in use becomes the preference, whoever changed it: the UI's
  // language follows the agent's, and the next call starts where this one left off
  const activeName = activeVoice?.voice;
  useEffect(() => {
    if (activeName) setVoice(activeName);
  }, [activeName, setVoice]);

  const phase: Phase = state === "ready" ? "live" : starting && CONNECTING.includes(state) ? "connecting" : "idle";

  useRTVIClientEvent(
    RTVIEvent.DeviceError,
    useCallback(() => {
      setMicDenied(true);
    }, []),
  );

  // When the agent hung up on a quiet caller, the landing screen says so, so
  // the call doesn't just vanish. The agent sends the reason before it leaves.
  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      if (endReason === "idle") setIdleEnded(true);
      setStarting(false);
      reset();
    }, [endReason, reset]),
  );

  // Over Daily, the bot leaving the room doesn't disconnect the browser, which
  // would stay on the call screen, alone in the room. Leaving too ends the
  // call here as well, and Disconnected above does the rest.
  useRTVIClientEvent(
    RTVIEvent.BotDisconnected,
    useCallback(() => {
      void disconnect?.();
    }, [disconnect]),
  );

  const error = micDenied ? t.landing.micError : connectError ? t.landing.unreachable : null;

  return (
    <Screens
      phase={phase}
      error={error}
      notice={idleEnded ? t.landing.idleEnded : null}
      onStart={() => {
        setMicDenied(false);
        setIdleEnded(false);
        setStarting(true);
        setStartVoice(persona, preferred.name);
        void connect?.();
      }}
      onEnd={() => {
        void disconnect?.();
        reset();
      }}
      onPersonaChange={onPersonaChange}
    />
  );
}

/**
 * Development only: ?fixture=CLM-2026-847291&screen=review|found|listening|landing,
 * or ?persona=employee&fixture=search&screen=listening|landing for the staff desk.
 */
function useFixture(persona: Persona): Fixture | null {
  const params = useSearchParams();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const id = params.get("fixture");
  const screen = params.get("screen");

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !id) return;
    let cancelled = false;
    import("@/fixtures/fixtures").then(({ buildFixture, buildSearchFixture }) => {
      if (cancelled) return;
      const view = (["landing", "listening", "found", "review"] as const).find((s) => s === screen) ?? "review";
      setFixture(
        persona === "employee"
          ? buildSearchFixture(view)
          : buildFixture(id === "1" ? "CLM-2026-847291" : id, view),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [id, screen, persona]);

  return fixture;
}

function App() {
  const params = useSearchParams();
  // ?persona=employee preselects the staff desk; the landing toggle changes it
  const [persona, setPersona] = useState<Persona>(() => {
    const asked = params.get("persona");
    return isPersona(asked) ? asked : "policyholder";
  });
  const fixture = useFixture(persona);

  const screens = ({ client, handleConnect, handleDisconnect, error }: PipecatBaseChildProps) => {
    if (!client) {
      // The client is created right after the first render
      return (
        <Landing
          onStart={() => {}}
          connecting={false}
          error={null}
          notice={null}
          persona={persona}
          onPersonaChange={setPersona}
        />
      );
    }
    if (fixture) {
      const key = JSON.stringify([persona, fixture.screen, fixture.session.claim?.claim_id]);
      return (
        <SessionProvider key={key} initial={fixture.session}>
          <FixtureConversation messages={fixture.messages}>
            <Screens
              phase="live"
              error={null}
              notice={null}
              forced={fixture.screen}
              onStart={() => {}}
              onEnd={() => {}}
              onPersonaChange={setPersona}
            />
          </FixtureConversation>
        </SessionProvider>
      );
    }
    return (
      <SessionProvider>
        <LiveConversation>
          <LiveApp
            connect={handleConnect}
            disconnect={handleDisconnect}
            connectError={error ?? null}
            onPersonaChange={setPersona}
          />
        </LiveConversation>
      </SessionProvider>
    );
  };

  return (
    <PersonaProvider persona={persona}>
      <PipecatAppBase transportType={TRANSPORT} connectParams={CONNECT_PARAMS[persona]} noThemeProvider>
        {/* One provider for every screen, so settings stay open as screens change */}
        {(props) => <SettingsProvider>{screens(props)}</SettingsProvider>}
      </PipecatAppBase>
    </PersonaProvider>
  );
}

export default function Page() {
  return (
    <Suspense>
      {/* Outside PipecatAppBase: the starting voice goes out with the connect request */}
      <PreferencesProvider>
        <DocumentLanguage />
        <App />
      </PreferencesProvider>
    </Suspense>
  );
}
