"use client";

import Image from "next/image";

import { useT } from "@/i18n";

// The logos are white, for the dark backgrounds the footer sits on
export function PartnerFooter() {
  const t = useT();
  return (
    <div
      className="flex items-center justify-center gap-3 sm:gap-6"
      aria-label={t.chrome.builtWith}
    >
      <Image src="/logos/deepgram.svg" alt="Deepgram" width={125} height={24} className="h-5 w-auto sm:h-6" />
      <span className="text-white/40" aria-hidden="true">
        ×
      </span>
      <Image src="/logos/aws.png" alt="AWS" width={320} height={191} className="h-7 w-auto sm:h-8" />
      <span className="text-white/40" aria-hidden="true">
        ×
      </span>
      <Image src="/logos/pipecat.svg" alt="Pipecat" width={124} height={24} className="h-5 w-auto sm:h-6" />
    </div>
  );
}
