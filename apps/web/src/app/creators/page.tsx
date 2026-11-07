import type { Metadata } from "next";
import { CreatorProfilePage } from "@/components/creator-profile";

export const metadata: Metadata = { title: "Creator profiles" };
export default function CreatorsPage() {
  return <CreatorProfilePage />;
}
