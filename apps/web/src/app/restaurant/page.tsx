import type { Metadata } from "next";
import { RestaurantProfilePage } from "@/components/restaurant-profile";

export const metadata: Metadata = { title: "Restaurant profile" };
export default function RestaurantPage() {
  return <RestaurantProfilePage />;
}
