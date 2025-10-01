// Server Component (no "use client" here)

// Segment options must live in a Server Component:
export const dynamic = "force-dynamic";
export const revalidate = 0;

import RagClientPage from "./RagClientPage";

export default function RagPage() {
  return <RagClientPage />;
}