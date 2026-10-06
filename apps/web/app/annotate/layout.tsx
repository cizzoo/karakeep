import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/server/auth";

export default async function AnnotateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  return <div className="h-screen w-screen overflow-hidden">{children}</div>;
}
