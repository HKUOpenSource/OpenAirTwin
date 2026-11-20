import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { powershell } from "@astryxdesign/core/CodeBlock/languages/powershell";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";

import { QUICK_START_STEPS, REPOSITORY_URL } from "../data/siteData";

type Platform = "unix" | "windows";

export function QuickStartSection() {
  const [platform, setPlatform] = useState<Platform>("unix");

  return (
    <div>
      <div className="oat-quickstart-bar">
        <SegmentedControl
          label="Select installation operating system"
          onChange={(next) =>
            setPlatform(next === "windows" ? "windows" : "unix")
          }
          size="md"
          value={platform}
        >
          <SegmentedControlItem label="macOS / Linux" value="unix" />
          <SegmentedControlItem label="Windows PowerShell" value="windows" />
        </SegmentedControl>
        <Button
          endContent={<ExternalLink size={13} />}
          href={`${REPOSITORY_URL}#installation-details`}
          label="Full setup on GitHub"
          size="sm"
          variant="ghost"
        />
      </div>

      <div className="oat-quickstart-grid" id="installation-steps">
        {QUICK_START_STEPS.map((step) => (
          <article className="oat-quickstart-card" key={step.index}>
            <div className="oat-quickstart-card-head">
              <Badge label={`Step ${step.index}`} variant="blue" />
            </div>
            <div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
            <div className="oat-quickstart-code">
              <CodeBlock
                code={step.code[platform]}
                container="section"
                hasCopyButton
                hasLanguageLabel={false}
                isWrapped
                language={platform === "unix" ? "bash" : powershell}
                size="sm"
                title={platform === "unix" ? "bash" : "PowerShell"}
                width="100%"
              />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
