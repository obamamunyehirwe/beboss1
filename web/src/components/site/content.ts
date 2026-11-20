import {
  Banknote, BarChart3, Boxes, Building2, Coffee, HandCoins, HardHat, Pill, ScanBarcode, Scissors, Shirt, ShieldCheck, ShoppingBasket, Smartphone, Store, Truck, Users, WifiOff,
} from "lucide-react";
import type { TKey } from "@/lib/i18n-dict";

export const LEAKS: { icon: typeof Banknote; t: TKey; d: TKey }[] = [
  { icon: Banknote, t: "leak1T", d: "leak1D" },
  { icon: HandCoins, t: "leak2T", d: "leak2D" },
  { icon: Boxes, t: "leak3T", d: "leak3D" },
  { icon: WifiOff, t: "leak4T", d: "leak4D" },
  { icon: ShieldCheck, t: "leak5T", d: "leak5D" },
];

export const FEATURES: { icon: typeof Banknote; t: TKey; d: TKey }[] = [
  { icon: ScanBarcode, t: "f1T", d: "f1D" },
  { icon: Boxes, t: "f2T", d: "f2D" },
  { icon: HandCoins, t: "f3T", d: "f3D" },
  { icon: BarChart3, t: "f4T", d: "f4D" },
  { icon: Users, t: "f5T", d: "f5D" },
  { icon: ShieldCheck, t: "f6T", d: "f6D" },
];

export const SECTORS = [
  { icon: ShoppingBasket, name: "Retail & grocery" },
  { icon: Pill, name: "Pharmacies" },
  { icon: HardHat, name: "Hardware & building" },
  { icon: Truck, name: "Wholesale depots" },
  { icon: Smartphone, name: "Electronics & phones" },
  { icon: Shirt, name: "Fashion & cosmetics" },
  { icon: Coffee, name: "Restaurants & bars" },
  { icon: Scissors, name: "Salons & services" },
  { icon: Store, name: "Mini-supermarkets" },
  { icon: Building2, name: "Multi-branch chains" },
];
