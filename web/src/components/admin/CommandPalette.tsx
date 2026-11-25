import { useAdminText } from '@/lib/admin-copy';
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, KeyRound, Search, Smartphone, Store, Users } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { codesQuery, devicesQuery, paymentsQuery, shopsQuery, usersQuery } from "@/lib/admin-queries";
import { computeShopKey } from "@/lib/pricing";
import { formatRwf } from "@/lib/format";

export type NavEntry = { to: string; label: string; icon: ComponentType<{ className?: string }> };

/** Ctrl/⌘+K: jump to any page, shop, payment, code, device or staff member. */
export function CommandPalette({ nav, isAdmin, permissions }: { nav: readonly NavEntry[]; isAdmin: boolean; permissions: string[] }) {
  const [open, setOpen] = useState(false);
  const a=useAdminText();
  const navigate = useNavigate();
  const canViewShops = isAdmin || permissions.includes("shops.view");
  const canViewPayments = isAdmin || permissions.includes("payments.review") || permissions.includes("analytics.view");
  const canViewCodes = isAdmin || permissions.includes("payments.review");
  const canViewDevices = isAdmin || permissions.includes("devices.audit") || permissions.includes("analytics.view");
  const canViewUsers = isAdmin || permissions.includes("users.manage") || permissions.includes("shops.view");
  const shops = useQuery({ ...shopsQuery, enabled: open && canViewShops });
  const pays = useQuery({ ...paymentsQuery, enabled: open && canViewPayments });
  const codes = useQuery({ ...codesQuery, enabled: open && canViewCodes });
  const devices = useQuery({ ...devicesQuery, enabled: open && canViewDevices });
  const users = useQuery({ ...usersQuery, enabled: open && canViewUsers });

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const toShop = (id: string) => go(() => navigate({ to: "/admin/shops/$shopId", params: { shopId: id } }));

  return (
    <>
      <Button variant="glass" size="sm" className="hidden w-56 justify-between text-muted-foreground md:inline-flex" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-2">
          <Search /> {a('Search everything')}
        </span>
        <kbd className="rounded border border-border px-1.5 font-mono text-[10px]">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={a('Search everything')} />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{a('No matches.')}</CommandEmpty>
          <CommandGroup heading={a('Go to')}>
            {nav.map((n) => (
              <CommandItem key={n.to} value={`page ${n.label}`} onSelect={() => go(() => navigate({ to: n.to }))}>
                <n.icon className="size-4" /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          {canViewShops && <CommandGroup heading="Shops">
            {(shops.data ?? []).slice(0, 300).map((s) => (
              <CommandItem key={s.id} value={`shop ${s.shop_name} ${s.owner_username} ${s.owner_phone} ${s.owner_name} ${s.id}`} onSelect={() => toShop(s.id)}>
                <Store className="size-4" />
                <span className="truncate">{s.shop_name}</span>
                <span className="ml-auto text-xs text-muted-foreground">@{s.owner_username}</span>
              </CommandItem>
            ))}
          </CommandGroup>}
          {canViewPayments && <CommandGroup heading="Payments">
            {(pays.data ?? []).slice(0, 200).map((p) => (
              <CommandItem key={p.id} value={`payment ${p.shop_name} ${p.payer_phone} ${p.payer_full_name} ${p.owner_username} ${p.status} ${p.payment_note}`} onSelect={() => toShop(computeShopKey(p.owner_username, p.owner_phone))}>
                <CreditCard className="size-4" />
                <span className="truncate">{p.shop_name} · {p.provider} · {p.duration_months} mo</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatRwf(p.amount_rwf)} · {p.status.replaceAll("_", " ").toLowerCase()}</span>
              </CommandItem>
            ))}
          </CommandGroup>}
          {canViewCodes && <CommandGroup heading="Unlock codes">
            {(codes.data ?? []).slice(0, 200).map((c) => (
              <CommandItem key={c.id} value={`code ${c.unlock_code} ${c.shop_username} ${c.shop_phone}`} onSelect={() => toShop(computeShopKey(c.shop_username, c.shop_phone))}>
                <KeyRound className="size-4" />
                <span className="truncate font-mono text-xs">{c.unlock_code}</span>
                <span className="ml-auto text-xs text-muted-foreground">@{c.shop_username} · {c.status.toLowerCase()}</span>
              </CommandItem>
            ))}
          </CommandGroup>}
          {canViewDevices && <CommandGroup heading="Devices">
            {(devices.data ?? []).slice(0, 200).map((d) => (
              <CommandItem key={d.id} value={`device ${d.device_name} ${d.device_id} ${d.join_code} ${d.shop_name} ${d.assigned_username}`} onSelect={() => toShop(d.shop_sync_key)}>
                <Smartphone className="size-4" />
                <span className="truncate">{d.device_name || d.device_id}</span>
                <span className="ml-auto text-xs text-muted-foreground">{d.shop_name}</span>
              </CommandItem>
            ))}
          </CommandGroup>}
          {canViewUsers && <CommandGroup heading="Shop staff">
            {(users.data ?? []).slice(0, 200).map((u) => (
              <CommandItem key={u.id} value={`staff ${u.full_name} ${u.username} ${u.phone} ${u.shop_name}`} onSelect={() => toShop(u.shop_sync_key)}>
                <Users className="size-4" />
                <span className="truncate">{u.full_name} @{u.username}</span>
                <span className="ml-auto text-xs text-muted-foreground">{u.role.toLowerCase()} · {u.shop_name}</span>
              </CommandItem>
            ))}
          </CommandGroup>}
        </CommandList>
      </CommandDialog>
    </>
  );
}
