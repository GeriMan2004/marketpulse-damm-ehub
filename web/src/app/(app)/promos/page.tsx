/**
 * Promo Budget Flow — graph-first view of monthly promo-plan allocation.
 */

import { PageContent } from "@/components/shell/PageContent"
import { PageWidthWrapper } from "@/components/shell/PageWidthWrapper"
import { PromoBudgetFlowView } from "./promo-budget-flow-view"

export default function Page() {
  return (
    <PageContent>
      <PageWidthWrapper className="max-w-none pb-10">
        <PromoBudgetFlowView />
      </PageWidthWrapper>
    </PageContent>
  )
}
