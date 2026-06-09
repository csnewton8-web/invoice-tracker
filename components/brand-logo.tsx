"use client";

import Image from "next/image";
import Link from "next/link";

type Props = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  stacked?: boolean;
};

const sizes = {
  sm: { logo: 140, icon: 32, text: "text-xs" },
  md: { logo: 180, icon: 40, text: "text-sm" },
  lg: { logo: 260, icon: 56, text: "text-base" },
};

export function BrandLogo({
  href = "/invoices",
  size = "md",
  showTagline = false,
  stacked = false,
}: Props) {
  const s = sizes[size];

  const content = stacked ? (
    <div className="flex flex-col items-start">
      <Image
        src="/logo/flashfox-logo.png"
        alt="Flash Fox"
        width={s.logo}
        height={60}
        priority
      />
      {showTagline && (
        <div className={`mt-2 text-slate-400 ${s.text}`}>
          Fast. Smart. On Time.
        </div>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <Image
        src="/logo/flashfox-icon.png"
        alt="Flash Fox"
        width={s.icon}
        height={s.icon}
        priority
      />
      <div className="flex flex-col">
        <span className="text-lg font-semibold text-white">
          FlashFox
        </span>
        {showTagline && (
          <span className={`text-slate-400 ${s.text}`}>
            Fast. Smart. On Time.
          </span>
        )}
      </div>
    </div>
  );

  return <Link href={href}>{content}</Link>;
}