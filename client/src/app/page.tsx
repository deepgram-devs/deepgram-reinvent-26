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
import { FixtureConversation, LiveConversation } from "@/lib/conversation";
import { isPersona, PersonaProvider, usePersona, type Persona } from "@/lib/persona";
import { SessionProvider, useSession } from "@/lib/session";
import { SettingsProvider } from "@/lib/settings";

// The browser sends its WebRTC offer here; next.config.ts passes it on to
// the bot, and requestData reaches it as runner_args.body. One object per
// persona, kept outside the component: PipecatAppBase rebuilds its client
// whenever these objects change, so switching persona between calls is fine.
const CONNECT_PARAMS: Record<Persona, { webrtcRequestParams: { endpoint: string; requestData: { persona: Persona } } }> = {
  policyholder: { webrtcRequestParams: { endpoint: "/api/offer", requestData: { persona: "policyholder" } } },
  employee: { webrtcRequestParams: { endpoint: "/api/offer", requestData: { persona: "employee" } } },
};

type Phase = "idle" | "connecting" | "live";

const CONNECTING = ["initializing", "initialized", "authenticating", "authenticated", "connecting", "connected"];

function Screens({
  phase,
  error,
  forced,
  onStart,
  onEnd,
  onPersonaChange,
}: {
  phase: Phase;
  error: string | null;
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
  const { reset } = useSession();
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const phase: Phase = state === "ready" ? "live" : starting && CONNECTING.includes(state) ? "connecting" : "idle";

  useRTVIClientEvent(
    RTVIEvent.DeviceError,
    useCallback(() => {
      setNotice("We couldn't use your microphone. Allow microphone access in your browser, then try again.");
    }, []),
  );

  useRTVIClientEvent(
    RTVIEvent.Disconnected,
    useCallback(() => {
      setStarting(false);
      reset();
    }, [reset]),
  );

  const error =
    notice ??
    (connectError
      ? "We couldn't reach the claims agent. Start it with python agent.py, then try again."
      : null);

  return (
    <Screens
      phase={phase}
      error={error}
      onStart={() => {
        setNotice(null);
        setStarting(true);
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
      <PipecatAppBase transportType="smallwebrtc" connectParams={CONNECT_PARAMS[persona]} noThemeProvider>
        {/* One provider for every screen, so settings stay open as screens change */}
        {(props) => <SettingsProvider>{screens(props)}</SettingsProvider>}
      </PipecatAppBase>
    </PersonaProvider>
  );
}

export default function Page() {
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
