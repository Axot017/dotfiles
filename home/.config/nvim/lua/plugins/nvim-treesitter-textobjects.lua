return {
  "nvim-treesitter/nvim-treesitter-textobjects",
  branch = "main",
  dependencies = {
    "nvim-treesitter/nvim-treesitter",
  },
  init = function()
    vim.g.no_plugin_maps = true
  end,
  keys = {
    {
      "af",
      function()
        require("nvim-treesitter-textobjects.select").select_textobject("@function.outer", "textobjects")
      end,
      mode = { "x", "o" },
      desc = "Select a function",
    },
    {
      "if",
      function()
        require("nvim-treesitter-textobjects.select").select_textobject("@function.inner", "textobjects")
      end,
      mode = { "x", "o" },
      desc = "Select a function body",
    },
    {
      "ac",
      function()
        require("nvim-treesitter-textobjects.select").select_textobject("@class.outer", "textobjects")
      end,
      mode = { "x", "o" },
      desc = "Select a class",
    },
    {
      "ic",
      function()
        require("nvim-treesitter-textobjects.select").select_textobject("@class.inner", "textobjects")
      end,
      mode = { "x", "o" },
      desc = "Select a class body",
    },
    {
      "]f",
      function()
        require("nvim-treesitter-textobjects.move").goto_next_start("@function.outer", "textobjects")
      end,
      mode = { "n", "x", "o" },
      desc = "Go to next function",
    },
    {
      "]F",
      function()
        require("nvim-treesitter-textobjects.move").goto_next_end("@function.outer", "textobjects")
      end,
      mode = { "n", "x", "o" },
      desc = "Go to next function end",
    },
    {
      "[f",
      function()
        require("nvim-treesitter-textobjects.move").goto_previous_start("@function.outer", "textobjects")
      end,
      mode = { "n", "x", "o" },
      desc = "Go to previous function",
    },
    {
      "[F",
      function()
        require("nvim-treesitter-textobjects.move").goto_previous_end("@function.outer", "textobjects")
      end,
      mode = { "n", "x", "o" },
      desc = "Go to previous function end",
    },
  },
  opts = {
    select = {
      lookahead = true,
      selection_modes = {
        ["@parameter.outer"] = "v",
        ["@function.outer"] = "V",
        ["@class.outer"] = "<c-v>",
      },
      include_surrounding_whitespace = true,
    },
    move = {
      set_jumps = true,
    },
  },
}
