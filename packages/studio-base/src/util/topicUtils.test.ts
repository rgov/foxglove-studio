// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// This file incorporates work covered by the following copyright and
// permission notice:
//
//   Copyright 2019-2021 Cruise LLC
//
//   This source code is licensed under the Apache License, Version 2.0,
//   found at http://www.apache.org/licenses/LICENSE-2.0
//   You may not use this file except in compliance with the License.
import {
  addTopicPrefix,
  cartesianProduct,
  joinTopics,
  makeTopicCombos,
} from "@foxglove/studio-base/util/topicUtils";

describe("topicUtil", () => {
  describe("joinTopics", () => {
    it("joins topics with a single /", () => {
      expect(joinTopics()).toEqual("/");
      expect(joinTopics("/foo", "bar")).toEqual("/foo/bar");
      expect(joinTopics("/foo", "/bar")).toEqual("/foo/bar");
      expect(joinTopics("/foo", "/bar/")).toEqual("/foo/bar");
      expect(joinTopics("foo", "bar")).toEqual("/foo/bar");
      expect(joinTopics("//foo", "bar", "/baz")).toEqual("/foo/bar/baz");
      expect(joinTopics("/foo", "////bar", "baz")).toEqual("/foo/bar/baz");
    });
  });

  describe("addTopicPrefix", () => {
    it("works for arrays of topics", () => {
      expect(addTopicPrefix(["foo"], "prefix")).toEqual([`/prefix/foo`]);
      expect(addTopicPrefix(["//foo/bar"], "prefix")).toEqual([`/prefix/foo/bar`]);
      expect(addTopicPrefix(["foo", "bar"], "prefix")).toEqual([`/prefix/foo`, `/prefix/bar`]);
      expect(addTopicPrefix(["/foo", "//bar"], "prefix")).toEqual([`/prefix/foo`, `/prefix/bar`]);
    });
  });

  describe("makeTopicCombos", () => {
    it("makes combinations", () => {
      expect(makeTopicCombos(["foo"], ["bar", "qux"])).toEqual(["/foo/bar", "/foo/qux"]);
      expect(makeTopicCombos(["foo", "bar"], ["qux"])).toEqual(["/foo/qux", "/bar/qux"]);
      expect(makeTopicCombos(["foo"], ["bar", "qux"])).toEqual(["/foo/bar", "/foo/qux"]);
      expect(makeTopicCombos(["foo", "bar"], ["cool", "beans"])).toEqual([
        "/foo/cool",
        "/foo/beans",
        "/bar/cool",
        "/bar/beans",
      ]);
    });
  });

  describe("cartesianProduct", () => {
    it("works", () => {
      expect(cartesianProduct([["foo"], ["bar"]])).toEqual([["foo", "bar"]]);
      expect(cartesianProduct([["foo"], ["bar", "qux"]])).toEqual([
        ["foo", "bar"],
        ["foo", "qux"],
      ]);
      expect(cartesianProduct([["foo"], ["bar", "qux"]])).toEqual([
        ["foo", "bar"],
        ["foo", "qux"],
      ]);
      expect(
        cartesianProduct([
          ["foo", "bar"],
          ["cool", "beans"],
        ]),
      ).toEqual([
        ["foo", "cool"],
        ["foo", "beans"],
        ["bar", "cool"],
        ["bar", "beans"],
      ]);
    });
  });
});
