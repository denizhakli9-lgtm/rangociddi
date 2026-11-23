import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BLOCK_STYLES as S } from '@/lib/seo/blockStyles';
import { businessFactsLine, isExternalPath, type Block, type BlockAction, type BlockLink, type BusinessSummary } from '@/lib/seo/blocks';
import { newTabClick, systemLinkClick } from '@/lib/platform';

/** Site-internal paths navigate inside the app; web addresses open in a new tab (in-app browser on mobile). */
function Anchor({ link, className, children }: { link: BlockLink; className?: string; children: ReactNode }) {
  if (!isExternalPath(link.path)) {
    return <Link to={link.path} className={className}>{children}</Link>;
  }
  if (/^https?:\/\//i.test(link.path)) {
    // In the mobile app a WhatsApp link is handed to the system (opens WhatsApp); other sites open in the in-app browser.
    const onClick = /^https:\/\/wa\.me\//i.test(link.path) ? systemLinkClick(link.path) : newTabClick(link.path);
    return <a href={link.path} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>{children}</a>;
  }
  return <a href={link.path} className={className}>{children}</a>;
}

function Actions({ actions }: { actions?: BlockAction[] }) {
  if (!actions?.length) return null;
  return (
    <div className={S.actions}>
      {actions.map((action) => (
        <Anchor key={action.path + action.label} link={action} className={action.primary ? S.actionPrimary : S.actionSecondary}>{action.label}</Anchor>
      ))}
    </div>
  );
}

function Heading({ title, text }: { title?: string; text?: string }) {
  return (
    <>
      {title && <h2 className={S.sectionTitle}>{title}</h2>}
      {text && <p className={S.sectionText}>{text}</p>}
    </>
  );
}

/** The first cards are usually on screen when the page opens; the rest load as they scroll in. */
const EAGER_IMAGES = 3;

function DefaultBusinessCard({ item, index }: { item: BusinessSummary; index: number }) {
  const facts = businessFactsLine(item);
  return (
    <Link to={item.path} className={S.businessCard}>
      {item.image && (
        <div className={S.businessMedia}>
          <img src={item.image.src} alt={item.image.alt} loading={index < EAGER_IMAGES ? 'eager' : 'lazy'} decoding="async" className={S.businessImage} />
          {item.image.note && <span className={S.businessImageNote}>{item.image.note}</span>}
          {item.badge && <span className={S.businessBadge}>{item.badge}</span>}
        </div>
      )}
      <div className={S.businessBody}>
        {item.category && <p className={S.businessEyebrow}>{item.category}</p>}
        <h3 className={S.businessName}>{item.name}</h3>
        {facts && <p className={S.businessFacts}>{facts}</p>}
        {item.description && <p className={S.businessText}>{item.description}</p>}
      </div>
    </Link>
  );
}

interface Props {
  blocks: Block[];
  /** Lets a page show its own, richer card for a listed business; return null to keep the default card. */
  renderBusiness?: (item: BusinessSummary) => ReactNode;
}

function BlockView({ block, renderBusiness }: { block: Block; renderBusiness?: Props['renderBusiness'] }) {
  switch (block.kind) {
    case 'breadcrumb':
      return (
        <nav aria-label="Breadcrumb">
          <ol className={S.breadcrumbList}>
            {block.items.map((item, i) => (
              <li key={item.name + i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" className={S.breadcrumbSeparator}>›</span>}
                {item.path && i < block.items.length - 1 ? (
                  <Link to={item.path} className={S.breadcrumbLink}>{item.name}</Link>
                ) : (
                  <span aria-current={i === block.items.length - 1 ? 'page' : undefined} className={S.breadcrumbCurrent}>{item.name}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      );
    case 'hero':
      return (
        <header>
          {block.eyebrow && <p className={S.heroEyebrow}>{block.eyebrow}</p>}
          <h1 className={S.heroTitle}>{block.title}</h1>
          {block.lead && <p className={S.heroLead}>{block.lead}</p>}
          <Actions actions={block.actions} />
        </header>
      );
    case 'businesses':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <ul className={S.businessGrid}>
            {block.items.map((item, i) => (
              <li key={item.slug}>{renderBusiness?.(item) ?? <DefaultBusinessCard item={item} index={i} />}</li>
            ))}
          </ul>
        </section>
      );
    case 'table':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <div className={S.tableWrap}>
            <table className={S.table}>
              <thead className={S.tableHead}>
                <tr>
                  {block.head.map((cell) => (
                    <th key={cell} scope="col" className={S.tableHeadCell}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={S.tableBody}>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className={c === 0 ? S.tableCellFirst : S.tableCell}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note && <p className={S.note}>{block.note}</p>}
        </section>
      );
    case 'links':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <ul className={S.linkList}>
            {block.items.map((item) => (
              <li key={item.path}>
                <Anchor link={item} className={S.linkChip}>
                  {item.label}
                  {item.detail && <span className={S.linkDetail}>{item.detail}</span>}
                </Anchor>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'steps':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <ol className={S.cardGrid3}>
            {block.items.map((item, i) => (
              <li key={item.title} className={S.stepCard}>
                <span aria-hidden="true" className={S.stepNumber}>{i + 1}</span>
                <h3 className={S.cardTitle}>{item.title}</h3>
                <p className={S.cardText}>{item.text}</p>
              </li>
            ))}
          </ol>
        </section>
      );
    case 'features':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <ul className={S.cardGrid}>
            {block.items.map((item) => (
              <li key={item.title} className={S.stepCard}>
                <h3 className={S.featureTitle}>{item.title}</h3>
                <p className={S.cardText}>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'faq':
      return (
        <section>
          <Heading title={block.title} text={block.text} />
          <div className={S.faqList}>
            {block.items.map((item) => (
              <details key={item.q} className={S.faqItem}>
                <summary className={S.faqQuestion}>
                  <span>{item.q}</span>
                  <span aria-hidden="true" className={S.faqIcon}>+</span>
                </summary>
                <p className={S.faqAnswer}>{item.a}</p>
                {item.link && <Anchor link={item.link} className={S.faqLink}>{item.link.label}</Anchor>}
              </details>
            ))}
          </div>
        </section>
      );
    case 'prose':
      return (
        <section>
          <Heading title={block.title} />
          <div className={block.title ? S.prose : S.proseUntitled}>
            {block.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
      );
    case 'cta':
      return (
        <section className={S.cta}>
          <h2 className={S.ctaTitle}>{block.title}</h2>
          {block.text && <p className={S.ctaText}>{block.text}</p>}
          <Actions actions={block.actions} />
        </section>
      );
    case 'notice':
      return (
        <p className={S.notice}>
          {block.text}
          {block.link && <Anchor link={block.link} className={S.noticeLink}>{block.link.label}</Anchor>}
        </p>
      );
  }
}

/**
 * Renders a content page from its block list. The same list is rendered to static HTML at
 * build time by `seo/renderBlocks.ts`; keep the two in step when changing the markup.
 */
export function Blocks({ blocks, renderBusiness }: Props) {
  return (
    <div className={S.page}>
      {blocks.map((block, i) => (
        <BlockView key={`${block.kind}-${i}`} block={block} renderBusiness={renderBusiness} />
      ))}
    </div>
  );
}
