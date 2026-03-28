return {
  "mfussenegger/nvim-dap",
  dependencies = {
    {
        "igorlfs/nvim-dap-view",
        lazy = false,
        version = "1.*",
        opts = {},
    },
    {
      "leoluz/nvim-dap-go",
      main = "dap-go",
      opts = {},
    },
    {
      "theHamsta/nvim-dap-virtual-text",
      opts = {},
    },
    "nvim-neotest/nvim-nio",
  },
  keys = {
    {
      "<leader>dt",
      "<CMD>DapViewToggle<CR>",
      silent = true,
      desc = "DAP view toggle",
    },
    {
      "<leader>dw",
      "<CMD>DapViewWatch<CR>",
      silent = true,
      desc = "DAP view toggle",
    },
    {
      "<leader>dc",
      function() require("dap").continue() end,
      silent = true,
      desc = "DAP continue",
    },
    {
      "<leader>di",
      function() require("dap").step_into() end,
      silent = true,
      desc = "DAP step into",
    },
    {
      "<leader>do",
      function() require("dap").step_over() end,
      silent = true,
      desc = "DAP step over",
    },
    {
      "<leader>db",
      function() require("dap").toggle_breakpoint() end,
      silent = true,
      desc = "DAP toggle breakpoint",
    },
  },
}
