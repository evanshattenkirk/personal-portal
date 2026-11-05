"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "./brand";
import { Icon } from "./Kit";
const items = [
  ["/", "Home", "home"],
  ["/trips", "Trips", "plane"],
  ["/points", "Wallet", "wallet"],
  ["/ledgers", "Ledgers", "wallet"],
  ["/todo", "Your list", "clock"],
  ["/deadlines", "Actions", "check"],
  ["/links", "Library", "link"],
];
export default function Nav({ demo = false }: { demo?: boolean }) {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon size={24} />
          </span>
          <span>
            {BRAND}
            <small>PLANS, PLACES & EVERYDAY LIFE</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {items.map(([href, label, icon]) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/" ? path === href : path.startsWith(href))
                  ? "active"
                  : ""
              }
              aria-current={
                (href === "/" ? path === href : path.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              <Icon name={icon} size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <span
          className="profile-dot"
          title={
            demo
              ? "Demo · saved only in this browser"
              : "Private personal portal"
          }
        >
          {demo ? "D" : "E"}
        </span>
      </div>
      {demo && (
        <div className="demo-banner">
          Demo · changes save in this browser only
        </div>
      )}
    </header>
  );
}
