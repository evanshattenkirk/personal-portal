"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  // Preview only: ?look=a|b|c switches between the candidate directions.
  useEffect(() => {
    try {
      const look =
        new URLSearchParams(window.location.search).get("look") ??
        sessionStorage.getItem("look");
      if (look && /^[abc]$/.test(look)) {
        sessionStorage.setItem("look", look);
        document.documentElement.dataset.direction = look;
      }
    } catch {}
  }, [path]);
  return (
    <header className="site-header">
      <div className="nav-wrap">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            Evan’s <b>Fieldbook</b>
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
          Demo fieldbook · changes save in this browser only
        </div>
      )}
    </header>
  );
}
