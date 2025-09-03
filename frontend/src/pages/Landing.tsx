// src/pages/LandingPage.tsx
import React from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  BoltIcon,
  ChartBarIcon,
  BanknotesIcon,
  AdjustmentsHorizontalIcon,
  InboxArrowDownIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { VideoCard } from "../components/videoCard/VideoCard";

gsap.registerPlugin(ScrollTrigger);

/* ---------------- helpers ---------------- */

const Section = ({
  id,
  children,
  className = "",
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    id={id}
    className={[
      // keeps section below sticky header on #hash navigation
      "relative py-20 sm:py-28 scroll-mt-20 sm:scroll-mt-24",
      "bg-transparent",
      className,
    ].join(" ")}
  >
    {children}
  </section>
);

/** Rich 3D background with depth planes + glow discs */
function Background3D() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20">
      {/* soft radial wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 50% at 20% 15%, rgba(16,185,129,0.10) 0%, transparent 60%), radial-gradient(60% 60% at 80% 85%, rgba(34,211,238,0.10) 0%, transparent 60%)",
          filter: "saturate(1.05)",
        }}
      />

      {/* 3D group */}
      <div className="absolute inset-0" style={{ transformStyle: "preserve-3d", perspective: "1200px" }}>
        {/* far grid (deep) */}
        <div
          data-bg-grid
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
          style={{
            width: "180vmax",
            height: "180vmax",
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            borderRadius: 32,
            transform: "translateZ(-480px) rotateX(58deg) rotateZ(-20deg) translateY(8vh)",
            willChange: "transform",
          }}
        />

        {/* mid “glass” planes */}
        <div
          data-bg-plane-1
          className="absolute rounded-[28px] opacity-[0.12]"
          style={{
            width: "65vmin",
            height: "40vmin",
            left: "10vw",
            top: "12vh",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05))",
            transform: "translateZ(-260px) rotateX(14deg) rotateZ(-8deg)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
            willChange: "transform",
          }}
        />
        <div
          data-bg-plane-2
          className="absolute rounded-[28px] opacity-[0.12]"
          style={{
            width: "55vmin",
            height: "34vmin",
            right: "8vw",
            bottom: "12vh",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05))",
            transform: "translateZ(-220px) rotateX(12deg) rotateZ(10deg)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
            willChange: "transform",
          }}
        />

        {/* glow discs (near) */}
        <div
          data-bg-disc-1
          className="absolute h-[58vmin] w-[58vmin] rounded-full blur-3xl opacity-90"
          style={{
            left: "5vw",
            top: "6vh",
            background:
              "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.22), transparent 60%)",
            transform: "translateZ(-180px)",
            willChange: "transform",
          }}
        />
        <div
          data-bg-disc-2
          className="absolute h-[50vmin] w-[50vmin] rounded-full blur-3xl opacity-90"
          style={{
            right: "6vw",
            bottom: "6vh",
            background:
              "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.22), transparent 60%)",
            transform: "translateZ(-200px)",
            willChange: "transform",
          }}
        />

        {/* subtle grain overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            background:
              "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22160%22 viewBox=%220 0 160 160%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%222%22 stitchTiles=%22stitch%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%220.6%22/></svg>')",
          }}
        />
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function LandingPage() {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  React.useLayoutEffect(() => {
    const mm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mm.matches) return;

    const ctx = gsap.context(() => {
      // Keep ST measurements accurate
      const refresh = () => ScrollTrigger.refresh();
      window.addEventListener("load", refresh);

      // Batched reveals (no anchor hijack)
      ScrollTrigger.batch("[data-reveal]", {
        start: "top 92%",
        onEnter: (batch) =>
          gsap.fromTo(
            batch as gsap.TweenTarget,
            { y: 24, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.5,
              ease: "power2.out",
              stagger: { each: 0.06, from: "start" },
              overwrite: "auto",
            }
          ),
        onLeaveBack: (batch) =>
          gsap.to(batch as gsap.TweenTarget, {
            y: 24,
            opacity: 0,
            duration: 0.35,
            ease: "power1.inOut",
            stagger: { each: 0.04, from: "end" },
            overwrite: "auto",
          }),
      });

      // Parallax cards
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amt = Number(el.dataset.parallax) || 40;
        gsap.to(el, {
          y: amt,
          ease: "none",
          force3D: true,
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        });
        el.style.willChange = "transform";
        el.style.transform = "translateZ(0)";
      });

      // Story progress bar
      const progressBar = document.querySelector(".pm-progress");
      if (progressBar) {
        (progressBar as HTMLElement).style.willChange = "width";
        gsap.to(progressBar, {
          width: "100%",
          ease: "none",
          scrollTrigger: {
            trigger: "#story",
            start: "top center",
            end: "bottom center",
            scrub: true,
            invalidateOnRefresh: true,
          },
        });
      }

      // Background scroll parallax (subtle)
      const grid = document.querySelector<HTMLElement>("[data-bg-grid]");
      const disc1 = document.querySelector<HTMLElement>("[data-bg-disc-1]");
      const disc2 = document.querySelector<HTMLElement>("[data-bg-disc-2]");
      if (grid) {
        gsap.to(grid, {
          rotateZ: "-16deg",
          y: "5vh",
          ease: "none",
          scrollTrigger: { trigger: document.body, start: 0, end: "max", scrub: true },
        });
      }
      if (disc1) {
        gsap.to(disc1, {
          x: "-4vw",
          y: "6vh",
          ease: "none",
          scrollTrigger: { trigger: document.body, start: 0, end: "max", scrub: true },
        });
      }
      if (disc2) {
        gsap.to(disc2, {
          x: "3vw",
          y: "-5vh",
          ease: "none",
          scrollTrigger: { trigger: document.body, start: 0, end: "max", scrub: true },
        });
      }

      // -------- Mouse parallax depth (no anchor interference) --------
      const lerp = { x: 0, y: 0 };
      const onPointerMove = (e: PointerEvent) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tx = (e.clientX / vw) * 2 - 1; // -1..1
        const ty = (e.clientY / vh) * 2 - 1; // -1..1
        lerp.x += (tx - lerp.x) * 0.12;
        lerp.y += (ty - lerp.y) * 0.12;
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });

      const gridEl = document.querySelector<HTMLElement>("[data-bg-grid]");
      const p1El = document.querySelector<HTMLElement>("[data-bg-plane-1]");
      const p2El = document.querySelector<HTMLElement>("[data-bg-plane-2]");
      const d1El = document.querySelector<HTMLElement>("[data-bg-disc-1]");
      const d2El = document.querySelector<HTMLElement>("[data-bg-disc-2]");

      const tick = () => {
        if (gridEl) {
          gridEl.style.transform = `translateZ(-480px) rotateX(58deg) rotateZ(${
            -20 + lerp.x * 2
          }deg) translateY(${8 + lerp.y * 2}vh)`;
        }
        if (p1El) {
          p1El.style.transform = `translateZ(-260px) rotateX(${14 + lerp.y * 4}deg) rotateZ(${
            -8 + lerp.x * 5
          }deg) translate(${lerp.x * 10}vw, ${lerp.y * 4}vh)`;
        }
        if (p2El) {
          p2El.style.transform = `translateZ(-220px) rotateX(${12 - lerp.y * 4}deg) rotateZ(${
            10 - lerp.x * 5
          }deg) translate(${lerp.x * -8}vw, ${lerp.y * -3}vh)`;
        }
        if (d1El) {
          d1El.style.transform = `translateZ(-180px) translate(${lerp.x * 12}vw, ${lerp.y * 6}vh)`;
        }
        if (d2El) {
          d2El.style.transform = `translateZ(-200px) translate(${lerp.x * -10}vw, ${
            lerp.y * -5
          }vh)`;
        }
      };
      gsap.ticker.add(tick);

      // Cleanup listeners
      return () => {
        window.removeEventListener("load", refresh);
        window.removeEventListener("pointermove", onPointerMove);
        gsap.ticker.remove(tick);
      };
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const toApp = () => navigate("/dashboard");
  const toLogin = () => navigate("/login");

  return (
    <div ref={rootRef} className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <Background3D />

      {/* NAV */}
      <header
        className="sticky top-0 z-50 bg-white/5 border-b border-white/10"
        style={{
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          willChange: "transform",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-emerald-400/20 ring-1 ring-emerald-400/30 grid place-items-center">
                <BoltIcon className="h-5 w-5 text-emerald-300" />
              </div>
              <span className="font-semibold tracking-wide">PowerMoves</span>
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm text-white/80">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <a href="#testimonials" className="hover:text-white">Stories</a>
              <a href="#faq" className="hover:text-white">FAQ</a>
            </nav>
            <div className="flex items-center gap-2">
              <button
                onClick={toLogin}
                className="px-3 py-1.5 text-sm rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10"
              >
                Log in
              </button>
              <button
                onClick={toApp}
                className="px-3 py-1.5 text-sm rounded-lg bg-emerald-500/20 hover:bg-emerald-500/25 ring-1 ring-emerald-400/20 text-emerald-200 inline-flex items-center gap-1.5"
              >
                Launch App <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <Section className="overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl bg-emerald-500/10" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full blur-3xl bg-cyan-400/10" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}>
              <div
                className="inline-flex items-center gap-2 rounded-full bg-white/5 ring-1 ring-white/10 px-2.5 py-1.5 text-xs text-white/70 mb-4"
                data-reveal
              >
                <SparklesIcon className="h-4 w-4" />
                Built for clarity, speed & scale
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight" data-reveal>
                Make every dollar a <span className="text-emerald-300">Power Move</span>.
              </h1>
              <p className="mt-4 text-white/70 max-w-xl" data-reveal>
                PowerMoves is a modern money OS that unifies your accounts, categorizes spending,
                turns transactions into insight, and turns insight into action. From real-time cash
                flow to net-worth tracking and smart automations—this is your control center.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row gap-3" data-reveal>
                <button
                  onClick={toApp}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/25 ring-1 ring-emerald-400/30 text-emerald-200"
                >
                  Get Started
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                >
                  Explore Features
                </a>
              </div>

              <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-4" data-reveal>
                <Metric kpi="$250k+" label="Budgeted through PowerMoves" />
                <Metric kpi="12ms" label="Blazing-fast UI" />
                <Metric kpi="A+" label="Security posture" />
              </div>
            </div>

            {/* Visual / Parallax blocks */}
            <div className="relative lg:h-[520px] h-72" aria-hidden>
              <div
                className="absolute right-2 top-6 w-64 sm:w-80 lg:w-[380px] aspect-[4/3] rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-2xl"
                data-reveal
                data-parallax="40"
              >
                <HeroCard
                  title="Unified Accounts"
                  text="See all balances, all at once. Filter globally by any account—Plaid or manual."
                  icon={<BanknotesIcon className="h-5 w-5 text-emerald-300" />}
                />
              </div>
              <div
                className="absolute left-0 bottom-6 w-60 sm:w-72 lg:w-[320px] aspect-[4/3] rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-2xl"
                data-reveal
                data-parallax="20"
              >
                <HeroCard
                  title="Live Cashflow"
                  text="Today, 7D, 30D. Net flow, burn, and savings—instantly."
                  icon={<ChartBarIcon className="h-5 w-5 text-cyan-300" />}
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <HeaderEyebrow title="Features" subtitle="Everything you need to master your money" />
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            <FeatureCard
              icon={<InboxArrowDownIcon className="h-5 w-5 text-emerald-300" />}
              title="Seamless Sync"
              bullets={["Plaid-powered imports", "Account-aware backfills", "One-click refresh"]}
            />
            <FeatureCard
              icon={<AdjustmentsHorizontalIcon className="h-5 w-5 text-cyan-300" />}
              title="Global Filters"
              bullets={["Filter by any account", "Dates & presets", "Income / Expense views"]}
            />
            <FeatureCard
              icon={<ShieldCheckIcon className="h-5 w-5 text-emerald-300" />}
              title="Privacy First"
              bullets={["Local UI speed, secure APIs", "Field-level validations", "Least-privilege access"]}
            />
          </div>

          {/* Screens / imagery */}
          <div className="mt-12 grid lg:grid-cols-2 gap-6">
            <ImageCard src="/images/assets.png" caption="Crystal clear insights with elegant glass UI." />
            <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5" data-reveal>
              <div className="relative h-64">
                <VideoCard src="/video/stock.mp4" caption="" />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* STORY */}
      <Section id="story" className="py-24 sm:py-28 bg-white/[0.02] ring-1 ring-white/5">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative">
            <div className="absolute top-0 left-0 h-0.5 w-0 bg-emerald-400/70 rounded pm-progress" />
          </div>
          <HeaderEyebrow title="From Chaos to Clarity" subtitle="A calm narrative for your money" />
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            <StoryStep step="01" title="Connect" text="Securely link your institutions. We fetch balances and transactions for a unified view." />
            <StoryStep step="02" title="Understand" text="We categorize, summarize, and visualize. Patterns pop. Decisions simplify." />
            <StoryStep step="03" title="Act" text="Automate savings, prune waste, and deploy capital like a pro. Every move, a power move." />
          </div>
        </div>
      </Section>

      {/* PRICING */}
      <Section id="pricing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <HeaderEyebrow title="Pricing" subtitle="Simple, transparent, value-packed" />
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            <PriceCard
              name="Starter"
              price="$0"
              period="forever"
              cta="Start Free"
              features={["Unlimited manual transactions", "Core dashboards", "Email support"]}
              onClick={toApp}
            />
            <PriceCard
              name="Pro"
              badge="Popular"
              price="$9"
              period="/mo"
              cta="Upgrade to Pro"
              featured
              features={["Plaid sync", "Advanced filters & exports", "Priority support"]}
              onClick={toApp}
            />
            <PriceCard
              name="Business"
              price="Let's talk"
              period=""
              cta="Contact Sales"
              features={["Multi-user & roles", "Custom dashboards", "SLAs & SSO"]}
              onClick={() => window.alert("sales@powermoves.app")}
            />
          </div>
        </div>
      </Section>

      {/* TESTIMONIALS */}
      <Section id="testimonials">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <HeaderEyebrow title="Stories" subtitle="Builders, freelancers, and families love PowerMoves" />
          <div className="mt-10 grid md:grid-cols-3 gap-6">
            <Testimonial quote="PowerMoves turned my finances from a fog into a flight plan." name="Ava M." title="Product Designer" />
            <Testimonial quote="It’s the first money app that feels both serious and simple." name="Noah T." title="Indie Dev" />
            <Testimonial quote="We finally see our month at a glance. Less stress, better choices." name="The Garcias" title="Family of 4" />
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" className="bg-white/[0.02] ring-1 ring-white/5">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <HeaderEyebrow title="FAQ" subtitle="You ask. We answer." />
          <div className="mt-8 grid md:grid-cols-2 gap-6">
            <Faq q="Is my data secure?" a="Yes. We use bank-grade connections via Plaid, encrypt sensitive tokens at rest, and follow the principle of least privilege throughout the stack." />
            <Faq q="Can I track manual accounts?" a="Absolutely. Create manual accounts for cash, property, or any asset, then filter globally—manual and Plaid sources live side-by-side." />
            <Faq q="How fast is it?" a="Very. Client-side state and memoized queries keep interactions snappy. You’ll feel the difference immediately." />
            <Faq q="What does the Pro plan add?" a="Plaid syncing, power filters, CSV exports, and priority support—everything heavy users need." />
          </div>
        </div>
      </Section>

      {/* CTA */}
      <Section>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold" data-reveal>
            Ready to turn insight into action?
          </h2>
          <p className="mt-3 text-white/70" data-reveal>
            Join PowerMoves and get a calmer, clearer view of your money—plus the tools to move it with intent.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3" data-reveal>
            <button
              onClick={toApp}
              className="px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/25 ring-1 ring-emerald-400/30 text-emerald-200 inline-flex items-center gap-2"
            >
              Launch App <ArrowRightIcon className="h-4 w-4" />
            </button>
            <button
              onClick={toLogin}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 ring-1 ring-white/10 inline-flex items-center gap-2"
            >
              Log in <ArrowPathIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer
        className="mt-8 border-t border-white/10 bg-white/5"
        style={{ backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-emerald-400/20 ring-1 ring-emerald-400/30 grid place-items-center">
                <BoltIcon className="h-5 w-5 text-emerald-300" />
              </div>
              <span className="font-semibold tracking-wide">PowerMoves</span>
            </div>
            <div className="text-sm text-white/60">
              © {new Date().getFullYear()} PowerMoves. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- small components ---------------- */

function Metric({ kpi, label }: { kpi: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-4" data-reveal>
      <div className="text-xl font-semibold">{kpi}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}

function HeroCard({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="h-full w-full p-4 rounded-2xl overflow-hidden">
      <div className="inline-flex items-center gap-2 text-sm rounded-lg bg-white/5 ring-1 ring-white/10 px-2.5 py-1.5">
        {icon}
        <span className="text-white/80">{title}</span>
      </div>
      <p className="mt-3 text-sm text-white/70">{text}</p>
      <div className="mt-4 h-28 rounded-xl bg-gradient-to-br from-white/10 to-transparent ring-1 ring-white/10" />
      <div className="mt-3 h-2 w-2/3 rounded bg-white/10" />
      <div className="mt-2 h-2 w-1/2 rounded bg-white/10" />
    </div>
  );
}

function HeaderEyebrow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div data-reveal style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}>
      <div className="inline-flex items-center gap-2 text-xs rounded-full bg-white/5 ring-1 ring-white/10 px-2.5 py-1.5 text-white/70">
        <SparklesIcon className="h-4 w-4" />
        {title}
      </div>
      <h2 className="mt-3 text-2xl sm:text-3xl font-bold">{subtitle}</h2>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  bullets: string[];
}) {
  return (
    <div
      className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 hover:bg-white/[0.08] transition"
      data-reveal
      style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
    >
      <div className="inline-flex items-center gap-2 text-sm">
        <span className="inline-grid h-8 w-8 place-items-center rounded-xl bg-white/10">
          {icon}
        </span>
        <span className="font-medium">{title}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-white/70">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 text-emerald-300" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImageCard({ src, caption }: { src: string; caption: string }) {
  return (
    <figure
      className="rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5"
      data-reveal
      style={{ height: "16rem", willChange: "transform, opacity" }}
    >
      <img src={src} alt="" className="w-full h-full object-cover" />
      <figcaption className="p-3 text-xs text-white/70">{caption}</figcaption>
    </figure>
  );
}

function StoryStep({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div
      className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5"
      data-reveal
      style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
    >
      <div className="text-xs text-white/50">Step {step}</div>
      <div className="mt-1 font-semibold">{title}</div>
      <p className="mt-2 text-sm text-white/70">{text}</p>
    </div>
  );
}

function PriceCard({
  name,
  price,
  period,
  cta,
  features,
  onClick,
  featured,
  badge,
}: {
  name: string;
  price: string;
  period: string;
  cta: string;
  features: string[];
  onClick: () => void;
  featured?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={[
        "relative rounded-2xl p-5 ring-1 transition",
        featured ? "bg-emerald-500/10 ring-emerald-400/20 shadow-2xl" : "bg-white/5 ring-white/10",
      ].join(" ")}
      data-reveal
      style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
    >
      {badge && (
        <span className="absolute -top-3 right-4 text-[10px] rounded-full bg-emerald-400/20 ring-1 ring-emerald-400/30 px-2 py-0.5 text-emerald-200">
          {badge}
        </span>
      )}
      <div className="text-sm text-white/80">{name}</div>
      <div className="mt-1 text-3xl font-semibold">
        {price} <span className="text-base text-white/60">{period}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-white/70">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 text-emerald-300" /> {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onClick}
        className={[
          "mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 ring-1",
          featured
            ? "bg-emerald-500/20 hover:bg-emerald-500/25 ring-emerald-400/30 text-emerald-200"
            : "bg-white/5 hover:bg-white/10 ring-white/10",
        ].join(" ")}
      >
        {cta} <ArrowRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

function Testimonial({
  quote,
  name,
  title,
}: {
  quote: string;
  name: string;
  title: string;
}) {
  return (
    <blockquote
      className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5"
      data-reveal
      style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
    >
      <p className="text-sm leading-relaxed">“{quote}”</p>
      <footer className="mt-3 text-xs text-white/60">— {name}, {title}</footer>
    </blockquote>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-xl bg-white/5 ring-1 ring-white/10" data-reveal>
      <button className="w-full text-left px-4 py-3 flex items-center justify-between" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm">{q}</span>
        <span className="text-xs text-white/60">{open ? "–" : "+"}</span>
      </button>
      {open && <div className="px-4 pb-4 text-sm text-white/70">{a}</div>}
    </div>
  );
}
