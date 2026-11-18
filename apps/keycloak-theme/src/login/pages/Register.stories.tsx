import type { Meta, StoryObj } from "@storybook/react-vite";
import { createKcPageStory, fieldErrors } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "register.ftl" });

const meta = {
  title: "login/register.ftl",
  component: KcPageStory
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <KcPageStory />
};

export const EmailTaken: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        messagesPerField: fieldErrors({ email: "That email can't be used. Try logging in instead." }),
        profile: { attributesByName: { email: { value: "ada@example.com" }, firstName: { value: "Ada" } } }
      }}
    />
  )
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
