import type { Meta, StoryObj } from "@storybook/react-vite";
import { createKcPageStory, fieldErrors } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "login-update-password.ftl" });

const meta = {
  title: "login/login-update-password.ftl",
  component: KcPageStory
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <KcPageStory />
};

export const PasswordTooShort: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        messagesPerField: fieldErrors({ password: "Invalid password: minimum length 8." })
      }}
    />
  )
};

export const PasswordsDoNotMatch: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        messagesPerField: fieldErrors({ "password-confirm": "Password confirmation doesn't match." })
      }}
    />
  )
};
