/**
 * Landing page (/about). Композирует секции из app/components/landing/.
 *
 * Раньше всё это (~700 LOC: 9 секций + 6 sub-components + 4 data-таблицы
 * inline) было в одном файле. Декомпозиция P3:
 *  - Каждая секция → отдельный компонент в app/components/landing/
 *  - landing.tsx остаётся тонким composer-ом + meta + background-эффекты
 *
 * Никаких функциональных изменений vs пред. версии — pure structural refactor.
 */

import { useAuth } from "~/lib/contexts/AuthContext";
import {
  Beams,
  ConicRays,
  GridBg,
  HorizontalParticles,
  Marquee,
  Orbs,
  Particles,
} from "~/components/nit";
import { LandingNav } from "~/components/landing/LandingNav";
import { HeroSection } from "~/components/landing/HeroSection";
import { ProblemSection } from "~/components/landing/ProblemSection";
import { HowItWorksSection } from "~/components/landing/HowItWorksSection";
import { HardwareSection } from "~/components/landing/HardwareSection";
import { FeaturesSection } from "~/components/landing/FeaturesSection";
import { CtaSection } from "~/components/landing/CtaSection";
import { LandingFooter } from "~/components/landing/LandingFooter";

export function meta() {
  return [
    { title: "NITGEN // AI sites on your own GPU" },
    {
      name: "description",
      content:
        "AI-конструктор сайтов, работающий на твоём GPU через peer-to-peer туннель. Никакого облака, никаких подписок, только локальные LLM. Open source.",
    },
  ];
}

export default function Landing() {
  const auth = useAuth();
  const isAuthed = auth.status === "authenticated";

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[color:var(--ink)] nit-grain">
      {/* Background-эффекты — fixed-positioned, не зависят от секций */}
      <ConicRays />
      <GridBg />
      <Orbs />
      <Beams />
      <Particles count={35} />
      <HorizontalParticles count={18} />

      <LandingNav isAuthed={isAuthed} />
      <HeroSection isAuthed={isAuthed} />

      {/* Marquee — единственный inline-блок т.к. данные тривиальны и нужны
          ровно один раз. Выделение в компонент только бы добавило шума. */}
      <Marquee
        items={[
          { text: "YOUR GPU" },
          { text: "YOUR CODE", variant: "outline" },
          { text: "✦", variant: "star" },
          { text: "NO CLOUD" },
          { text: "NO LIMITS", variant: "outline" },
          { text: "✦", variant: "star" },
          { text: "OPEN SOURCE" },
          { text: "ZERO BULLSHIT", variant: "outline" },
          { text: "✦", variant: "star" },
        ]}
      />

      <ProblemSection />
      <HowItWorksSection />
      <HardwareSection />
      <FeaturesSection />
      <CtaSection isAuthed={isAuthed} />
      <LandingFooter />
    </div>
  );
}
