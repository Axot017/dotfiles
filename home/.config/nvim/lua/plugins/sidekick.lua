return {
  "folke/sidekick.nvim",
  keys = {
    {
      "<C-y>",
      function()
        return require("sidekick").nes_jump_or_apply()
      end,
      expr = true,
      desc = "Goto/Apply Next Edit Suggestion",
    },
    {
      "<C-.>",
      function() require("sidekick.cli").toggle() end,
      mode = { "n", "t", "i", "x" },
      desc = "Sidekick Toggle",
    },
    {
      "<leader>ad",
      function() require("sidekick.cli").close() end,
      desc = "Detach a CLI Session",
    },
    {
      "<leader>at",
      function() require("sidekick.cli").send({ msg = "{this}" }) end,
      mode = { "n", "x" },
      desc = "Send This",
    },
    {
      "<leader>an",
      function() require("sidekick.cli").send({ msg = "{file}" }) end,
      desc = "Send File",
    },
    {
      "<leader>af",
      function() require("sidekick.cli").send({ msg = "{function}" }) end,
      desc = "Send function",
    },
    {
      "<leader>ac",
      function() require("sidekick.cli").send({ msg = "{class}" }) end,
      desc = "Send Class",
    },
    {
      "<leader>av",
      function() require("sidekick.cli").send({ msg = "{selection}" }) end,
      mode = "x",
      desc = "Send Visual Selection",
    },
    {
      "<leader>ap",
      function() require("sidekick.cli").prompt() end,
      mode = { "n", "x" },
      desc = "Sidekick Select Prompt",
    },
    {
      "<leader>aa",
      function() require("sidekick.cli").toggle({ name = "opencode", focus = true }) end,
      desc = "Sidekick Toggle Claude",
    },
  },
  opts = {},
}
