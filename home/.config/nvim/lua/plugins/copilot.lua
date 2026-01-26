return {
  "zbirenbaum/copilot.lua",
  cmd = "Copilot",
  event = "InsertEnter",
  opts = {
    suggestion = {
      enabled = true,
      auto_trigger = true,
      trigger_on_accept = true,
      keymap = {
        accept = "<C-y>",
      },
    },
    panel = {
      enabled = false,
    },
  },
}
