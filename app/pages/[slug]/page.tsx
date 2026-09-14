import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettingsSection } from "@/lib/settingsDb";
import { Container } from "@/components/ui/Container";
import { PageBody } from "@/components/pages/PageBody";
import { ContactDetails } from "@/components/pages/ContactDetails";

export const dynamic = "force-dynamic";

async function loadPage(slug: string) {
  const { data } = await getSettingsSection("pages");
  return data.pages.find((p) => p.slug === slug && p.published) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPage(slug);
  return { title: page?.title ?? "الصفحة غير موجودة" };
}

/** A CMS page the admin edits: about, FAQ, policies, guides. */
export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadPage(slug);
  if (!page) notFound();

  return (
    <div className="py-10 sm:py-14">
      <Container>
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-extrabold text-ink sm:text-4xl">{page.title}</h1>
          <div className="card mt-6 rounded-[32px] p-6 sm:p-10">
            <PageBody body={page.body} />
          </div>
          {(slug === "contact" || slug === "about") && <ContactDetails />}
        </article>
      </Container>
    </div>
  );
}
