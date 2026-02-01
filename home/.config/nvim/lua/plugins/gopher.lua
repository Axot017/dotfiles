return {
  "olexsmir/gopher.nvim",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
  },
  keys = {
    {
      "<leader>ge",
      "<cmd>GoIfErr<CR>",
      silent = true,
      desc = "Add Go if err",
    },
    {
      "<leader>gt",
      function()
        require("gopher").test.add()
        local test_file = vim.fn.expand("%:r") .. "_test.go"
        vim.cmd("edit " .. test_file)
      end,
      silent = true,
      desc = "Add Go test",
    },
    {
      "<leader>gj",
      "<cmd>GoTagAdd json<CR>",
      silent = true,
      desc = "Add JSON tags",
    },
    {
      "<leader>gy",
      "<cmd>GoTagAdd yaml<CR>",
      silent = true,
      desc = "Add YAML tags",
    },
  },
  opts = {
    commands = {
      iferr = "iferr",
      go = "go",
      gomodifytags = "gomodifytags",
      gotests = "gotests",
      impl = "impl",
    },
  },
}
