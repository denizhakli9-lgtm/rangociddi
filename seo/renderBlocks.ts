/**
 * İçerik bloklarını statik HTML'e çevirir. `src/components/seo/Blocks.tsx` ile aynı işaretlemeyi
 * ve aynı sınıfları (`BLOCK_STYLES`) üretir; birini değiştirince diğerini de güncelleyin.
 */
import { BLOCK_STYLES as S } from '../src/lib/seo/blockStyles';
import { businessFactsLine, isExternalPath, type Block, type BlockAction, type BlockLink } from '../src/lib/seo/blocks';
import { escapeHtml as e } from '../src/lib/seo/meta';

/** Same number as in Blocks.tsx: the first cards load their photo immediately. */
const EAGER_IMAGES = 3;

function anchor(link: BlockLink, className: string, inner: string): string {
  const external = isExternalPath(link.path) && /^https?:\/\//i.test(link.path) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${e(link.path)}"${external} class="${className}">${inner}</a>`;
}

function actions(list?: BlockAction[]): string {
  if (!list?.length) return '';
  return `<div class="${S.actions}">${list.map((a) => anchor(a, a.primary ? S.actionPrimary : S.actionSecondary, e(a.label))).join('')}</div>`;
}

function heading(title?: string, text?: string): string {
  return `${title ? `<h2 class="${S.sectionTitle}">${e(title)}</h2>` : ''}${text ? `<p class="${S.sectionText}">${e(text)}</p>` : ''}`;
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'breadcrumb': {
      const items = block.items
        .map((item, i) => {
          const last = i === block.items.length - 1;
          const separator = i > 0 ? `<span aria-hidden="true" class="${S.breadcrumbSeparator}">›</span>` : '';
          const body =
            item.path && !last
              ? `<a href="${e(item.path)}" class="${S.breadcrumbLink}">${e(item.name)}</a>`
              : `<span${last ? ' aria-current="page"' : ''} class="${S.breadcrumbCurrent}">${e(item.name)}</span>`;
          return `<li class="flex items-center gap-2">${separator}${body}</li>`;
        })
        .join('');
      return `<nav aria-label="Breadcrumb"><ol class="${S.breadcrumbList}">${items}</ol></nav>`;
    }
    case 'hero':
      return `<header>${block.eyebrow ? `<p class="${S.heroEyebrow}">${e(block.eyebrow)}</p>` : ''}<h1 class="${S.heroTitle}">${e(block.title)}</h1>${
        block.lead ? `<p class="${S.heroLead}">${e(block.lead)}</p>` : ''
      }${actions(block.actions)}</header>`;
    case 'businesses': {
      const items = block.items
        .map((item, i) => {
          const facts = businessFactsLine(item);
          const media = item.image
            ? `<div class="${S.businessMedia}"><img src="${e(item.image.src)}" alt="${e(item.image.alt)}" loading="${i < EAGER_IMAGES ? 'eager' : 'lazy'}" decoding="async" class="${S.businessImage}" />${
                item.image.note ? `<span class="${S.businessImageNote}">${e(item.image.note)}</span>` : ''
              }${item.badge ? `<span class="${S.businessBadge}">${e(item.badge)}</span>` : ''}</div>`
            : '';
          return `<li><a href="${e(item.path)}" class="${S.businessCard}">${media}<div class="${S.businessBody}">${item.category ? `<p class="${S.businessEyebrow}">${e(item.category)}</p>` : ''}<h3 class="${
            S.businessName
          }">${e(item.name)}</h3>${facts ? `<p class="${S.businessFacts}">${e(facts)}</p>` : ''}${item.description ? `<p class="${S.businessText}">${e(item.description)}</p>` : ''}</div></a></li>`;
        })
        .join('');
      return `<section>${heading(block.title, block.text)}<ul class="${S.businessGrid}">${items}</ul></section>`;
    }
    case 'table': {
      const head = block.head.map((cell) => `<th scope="col" class="${S.tableHeadCell}">${e(cell)}</th>`).join('');
      const rows = block.rows.map((row) => `<tr>${row.map((cell, c) => `<td class="${c === 0 ? S.tableCellFirst : S.tableCell}">${e(cell)}</td>`).join('')}</tr>`).join('');
      return `<section>${heading(block.title, block.text)}<div class="${S.tableWrap}"><table class="${S.table}"><thead class="${S.tableHead}"><tr>${head}</tr></thead><tbody class="${
        S.tableBody
      }">${rows}</tbody></table></div>${block.note ? `<p class="${S.note}">${e(block.note)}</p>` : ''}</section>`;
    }
    case 'links': {
      const items = block.items
        .map((item) => `<li>${anchor(item, S.linkChip, `${e(item.label)}${item.detail ? `<span class="${S.linkDetail}">${e(item.detail)}</span>` : ''}`)}</li>`)
        .join('');
      return `<section>${heading(block.title, block.text)}<ul class="${S.linkList}">${items}</ul></section>`;
    }
    case 'steps': {
      const items = block.items
        .map(
          (item, i) =>
            `<li class="${S.stepCard}"><span aria-hidden="true" class="${S.stepNumber}">${i + 1}</span><h3 class="${S.cardTitle}">${e(item.title)}</h3><p class="${S.cardText}">${e(item.text)}</p></li>`,
        )
        .join('');
      return `<section>${heading(block.title, block.text)}<ol class="${S.cardGrid3}">${items}</ol></section>`;
    }
    case 'features': {
      const items = block.items.map((item) => `<li class="${S.stepCard}"><h3 class="${S.featureTitle}">${e(item.title)}</h3><p class="${S.cardText}">${e(item.text)}</p></li>`).join('');
      return `<section>${heading(block.title, block.text)}<ul class="${S.cardGrid}">${items}</ul></section>`;
    }
    case 'faq': {
      const items = block.items
        .map(
          (item) =>
            `<details class="${S.faqItem}"><summary class="${S.faqQuestion}"><span>${e(item.q)}</span><span aria-hidden="true" class="${S.faqIcon}">+</span></summary><p class="${S.faqAnswer}">${e(
              item.a,
            )}</p>${item.link ? anchor(item.link, S.faqLink, e(item.link.label)) : ''}</details>`,
        )
        .join('');
      return `<section>${heading(block.title, block.text)}<div class="${S.faqList}">${items}</div></section>`;
    }
    case 'prose':
      return `<section>${heading(block.title)}<div class="${block.title ? S.prose : S.proseUntitled}">${block.paragraphs.map((p) => `<p>${e(p)}</p>`).join('')}</div></section>`;
    case 'cta':
      return `<section class="${S.cta}"><h2 class="${S.ctaTitle}">${e(block.title)}</h2>${block.text ? `<p class="${S.ctaText}">${e(block.text)}</p>` : ''}${actions(block.actions)}</section>`;
    case 'notice':
      return `<p class="${S.notice}">${e(block.text)}${block.link ? anchor(block.link, S.noticeLink, e(block.link.label)) : ''}</p>`;
  }
}

/** Static HTML for a content page; the markup mirrors `<Blocks>` in the app. */
export function renderBlocks(blocks: Block[]): string {
  return `<div class="${S.page}">${blocks.map(renderBlock).join('\n          ')}</div>`;
}
