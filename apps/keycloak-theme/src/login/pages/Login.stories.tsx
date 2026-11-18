import type { Meta, StoryObj } from "@storybook/react-vite";
import { createKcPageStory, fieldErrors, bannerError } from "../KcPageStory";

const { KcPageStory } = createKcPageStory({ pageId: "login.ftl" });

const meta = {
  title: "login/login.ftl",
  component: KcPageStory
} satisfies Meta<typeof KcPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <KcPageStory />
};

export const WrongPassword: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        login: { username: "ada@example.com" },
        messagesPerField: fieldErrors({ username: "Invalid email or password", password: "Invalid email or password" })
      }}
    />
  )
};

export const LockedOut: Story = {
  render: () => (
    <KcPageStory
      kcContext={{
        login: { username: "ada@example.com" },
        message: bannerError("Too many failed attempts. Try again in a few minutes.")
      }}
    />
  )
};
