return {
  "nvim-neotest/neotest",
  dependencies = {
    "nvim-neotest/nvim-nio",
    "nvim-lua/plenary.nvim",
    "antoinemadec/FixCursorHold.nvim",
    "nvim-treesitter/nvim-treesitter",
    {
      "fredrikaverpil/neotest-golang",
      version = "*",
    },
    "jfpedroza/neotest-elixir",
  },
  keys = {
    {
      "<leader>trr",
      function() require("neotest").run.run() end,
      silent = true,
      desc = "Run nearest test",
    },
    {
      "<leader>trd",
      function() require("neotest").run.run({ strategy = "dap" }) end,
      silent = true,
      desc = "Debug nearest test",
    },
    {
      "<leader>trf",
      function() require("neotest").run.run({ vim.fn.expand("%") }) end,
      silent = true,
      desc = "Run file tests",
    },
    {
      "<leader>tst",
      function() require("neotest").summary.toggle() end,
      silent = true,
      desc = "Toggle test summary",
    },
    {
      "<leader>tot",
      function() require("neotest").output_panel.toggle() end,
      silent = true,
      desc = "Toggle test output",
    },
    {
      "<leader>toc",
      function() require("neotest").output_panel.clear() end,
      silent = true,
      desc = "Clear test output",
    },
  },
  opts = function()
    local go_config = {
      runner = "gotestsum"
    }
    return {
      adapters = {
        require("neotest-golang")(go_config),
        require("neotest-elixir"),
      },
    }
  end,
}
