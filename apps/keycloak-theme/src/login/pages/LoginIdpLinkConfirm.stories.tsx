import type { Meta, StoryObj } from "@storybook/react-vite";
import { createKcPageStory, bannerError } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "login-idp-link-confirm.ftl" });

const meta = {
  title: "login/login-idp-link-confirm.ftl",
  component: KcPageStory
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <KcPageStory />
};

export const Failed: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        message: bannerError("Could not link the accounts. Try again.")
      }}
    />
  )
};
