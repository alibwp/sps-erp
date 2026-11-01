import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/#modules", label: "Modules" },
  { href: "/#status", label: "System status" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-8 place-items-center rounded-md bg-blue-600 text-sm font-bold text-white">
            S
          </span>
          SPS ERP
        </Link>
        <div className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex dark:text-zinc-400">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}
